import { getPool, isDbConfigured, loadSql } from "./db";
import { readMenuItems, type MenuItem } from "./menu-source";

/**
 * The ONLY place this website writes to the restaurant database.
 *
 * Cart → confirm → dbo.Tbl_holdUpsCloudTempOO (one row per dish, 30 columns).
 * Nothing else is written: Tbl_HoldUpsCloud, Tbl_HoldUpsCloudTemp and the QR
 * table stay untouched. Tbl_Serials is only incremented for the numbers the
 * note asks for (INV, ODN, DL / PU).
 *
 * The table can be pointed somewhere else with WEB_ORDER_TABLE in .env.
 */

export const WEB_ORDER_TABLE =
  process.env.WEB_ORDER_TABLE?.trim() || "dbo.Tbl_holdUpsCloudTempOO";
const DELIVERY_FEE = 350;

export type WebOrderLine = { itemCode: string; qty: number; remark?: string };

export type WebOrderInput = {
  orderType: "DL" | "PU";
  scheduleDate: string; // YYYY-MM-DD
  scheduleTime: string; // HH:mm
  locCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerLocation?: string;
  orderNote?: string;
  items: WebOrderLine[];
};

export type WebOrderFailure =
  | { kind: "invalid"; message: string }
  | { kind: "not-configured"; message: string }
  | { kind: "table-missing"; message: string }
  | { kind: "items-changed"; message: string; changed: { itemCode: string; name?: string }[] }
  | { kind: "database"; message: string };

export type WebOrderResult = {
  tabelNo: string;
  orderNo: string;
  invoiceNo: string;
  orderType: "DL" | "PU";
  lines: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
};

const TEXT = (value: unknown, max: number) =>
  (typeof value === "string" ? value : "").trim().slice(0, max);

/** `001` -> `002`, `DL-0007` -> `DL-0008`, `7` -> `8` (prefix + padding kept). */
export function bumpSerial(raw: unknown): string {
  const value = raw === null || raw === undefined ? "0" : String(raw).trim();
  const match = value.match(/^(.*?)(\d+)\s*$/);
  if (!match) return `${value}1`;
  const [, prefix, digits] = match;
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${prefix}${next}`;
}

type LocRow = { LocCode: string | null; LocDes: string | null };
const CLEAN = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * The location this order belongs to. The guest's choice wins; otherwise the
 * restaurant's first location is used (one location = nothing to choose).
 * LocCode is the code POS knows, CusLoc the name the guest reads.
 */
async function resolveLocation(tx: Tx, code: string, fallbackName: string) {
  const ask = async (statement: string, withCode: boolean) => {
    const request = tx.request();
    if (withCode) request.input("code", code);
    const found = await request.query<LocRow>(statement);
    const row = found.recordset?.[0];
    return row ? { code: CLEAN(row.LocCode), name: CLEAN(row.LocDes) } : null;
  };

  try {
    if (code) {
      const chosen = await ask(
        "SELECT TOP 1 LocCode, LocDes FROM dbo.Tbl_LocationMaster WITH (NOLOCK) WHERE LocCode = @code",
        true,
      );
      if (chosen?.code) return chosen;
    }
    const first = await ask(
      "SELECT TOP 1 LocCode, LocDes FROM dbo.Tbl_LocationMaster WITH (NOLOCK) WHERE ISNULL(SubLoc, 0) = 0 ORDER BY LocCode",
      false,
    );
    if (first?.code) return first;
  } catch {
    /* Tbl_LocationMaster may not be readable — fall through to the browser's wording. */
  }
  return { code, name: fallbackName };
}

/**
 * `7` -> `DL-0007`. A counter that already carries its prefix (`DL-0007`) is
 * left alone, so both `int` and `varchar` serial tables work.
 */
export function labelSerial(raw: string, prefix: string): string {
  if (/[A-Za-z]/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "") || "0";
  return `${prefix}-${digits.padStart(4, "0")}`;
}

// Sri Lanka is UTC+5:30 all year — no daylight saving.
const LK_OFFSET_MS = 330 * 60 * 1000;

/** Today in Sri Lanka: `20261024` for the invoice, `2026-10-24` for SeriDate. */
export function sriLankaDay(now: number = Date.now()) {
  const t = new Date(now + LK_OFFSET_MS);
  const year = t.getUTCFullYear();
  const month = String(t.getUTCMonth() + 1).padStart(2, "0");
  const day = String(t.getUTCDate()).padStart(2, "0");
  return { iso: `${year}-${month}-${day}`, compact: `${year}${month}${day}` };
}

/**
 * A `date` column as `YYYY-MM-DD`.
 *
 * mssql hands a `date` back as a JavaScript Date, and `String(date)` is
 * "Wed Oct 25 2026 …" — not a day anybody can compare. Without this, every
 * invoice looked like it belonged to a different day and the counter was
 * reset to 1 on every order (INV-20261025-001, again and again).
 */
export function isoDayOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

/**
 * The next counter value, exactly like the QR order code:
 *  - a prefix in the stored value (`DL-0007`) is ignored, the number is 7
 *  - `daily` + a SeriDate that belongs to another day -> start again at 1
 *  - otherwise the number goes up by one
 */
export function nextCounter(prior: unknown, priorDate: string, todayIso: string, daily: boolean): number {
  const match = String(prior ?? "").match(/(\d+)\s*$/);
  const current = match ? Number(match[1]) : 0;
  if (daily && priorDate && priorDate !== todayIso) return 1;
  return (Number.isFinite(current) ? current : 0) + 1;
}

/** `INV-20261024-001` — the same shape the POS prints. */
export function composeInvoice(counter: number, compactDay: string): string {
  return `INV-${compactDay}-${String(counter).padStart(3, "0")}`;
}

/** Validates the browser payload before anything touches the database. */
export function readWebOrderInput(raw: unknown): WebOrderInput | string {
  const body = (raw ?? {}) as Record<string, unknown>;
  const orderType = body.orderType === "PU" ? "PU" : body.orderType === "DL" ? "DL" : null;
  if (!orderType) return "Choose delivery or pickup.";

  const scheduleDate = TEXT(body.scheduleDate, 10);
  const scheduleTime = TEXT(body.scheduleTime, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) return "Choose a date for this order.";
  if (!/^\d{2}:\d{2}$/.test(scheduleTime)) return "Choose a time for this order.";

  const when = new Date(`${scheduleDate}T${scheduleTime}:00+05:30`).getTime();
  if (Number.isNaN(when)) return "That date and time could not be read.";
  if (when < Date.now() - 60_000) return "That date and time is already in the past.";

  const customerName = TEXT(body.customerName, 200);
  if (customerName.length < 2) return "Please add the guest name.";

  const customerPhone = TEXT(body.customerPhone, 20).replace(/[^\d+]/g, "");
  if (customerPhone.replace(/\D/g, "").length < 9) return "Please add a phone number we can call.";

  const customerAddress = TEXT(body.customerAddress, 300);
  if (orderType === "DL" && customerAddress.length < 8) return "Please add the delivery address.";

  const lines = Array.isArray(body.items) ? body.items : [];
  const items: WebOrderLine[] = [];
  for (const entry of lines) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const itemCode = TEXT(row.itemCode, 10);
    const qty = Number(row.qty);
    if (!itemCode || !Number.isFinite(qty) || qty <= 0) continue;
    items.push({ itemCode, qty: Math.min(Math.round(qty * 100) / 100, 999), remark: TEXT(row.remark, 500) });
  }
  if (!items.length) return "The cart is empty.";

  return {
    orderType,
    scheduleDate,
    scheduleTime,
    locCode: TEXT(body.locCode, 10),
    customerName,
    customerPhone,
    customerAddress,
    customerLocation: TEXT(body.customerLocation, 200),
    orderNote: TEXT(body.orderNote, 500),
    items,
  };
}

export type TxRequest = {
  input(name: string, value: unknown): TxRequest;
  query<T>(statement: string): Promise<{ recordset?: T[]; rowsAffected?: number[] }>;
};

export type Tx = {
  begin(): Promise<unknown>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
  request(): TxRequest;
};

/** Which optional columns dbo.Tbl_Serials has (SeriDate / LocCode). */
export type SerialsShape = { date: boolean; loc: boolean };
let shapeCache: SerialsShape | null = null;

export async function readSerialsShape(pool: { request(): TxRequest }): Promise<SerialsShape> {
  if (shapeCache) return shapeCache;
  const found = await pool
    .request()
    .query<{ name: string }>(
      "SELECT c.name FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.Tbl_Serials')",
    );
  const names = new Set((found.recordset ?? []).map((row) => String(row.name).toLowerCase()));
  if (!names.size) throw new Error("dbo.Tbl_Serials could not be read");
  shapeCache = { date: names.has("seridate"), loc: names.has("loccode") };
  return shapeCache;
}

/**
 * Which of the optional columns the order table has.
 *
 * `ScheduleDateTime` is a real column in Tbl_holdUpsCloudTempOO, but an older
 * copy of the table had it computed — and SQL Server refuses an INSERT into a
 * computed column. So it is written only when it exists and is not computed.
 */
export type OrderTableShape = { scheduleDateTime: boolean };
let orderShapeCache: OrderTableShape | null = null;

export async function readOrderShape(
  pool: { request(): TxRequest },
): Promise<OrderTableShape> {
  if (orderShapeCache) return orderShapeCache;
  const found = await pool
    .request()
    .query<{ name: string; computed: boolean | number }>(
      `SELECT c.name, c.is_computed AS computed
         FROM sys.columns c
        WHERE c.object_id = OBJECT_ID('${WEB_ORDER_TABLE}')`,
    );
  const rows = found.recordset ?? [];
  if (!rows.length) throw new Error(`${WEB_ORDER_TABLE} could not be read`);
  const hit = rows.find((row) => String(row.name).toLowerCase() === "scheduledatetime");
  orderShapeCache = { scheduleDateTime: Boolean(hit) && !Boolean(hit?.computed) };
  return orderShapeCache;
}

type SerialArgs = {
  code: string;
  locCode?: string;
  daily?: boolean; // reset on a new day when SeriDate exists
  format?: (counter: number) => string; // what the guest / POS reads
  badge?: string; // padded table-number prefix, e.g. DL -> DL-0007
};

/**
 * Takes one number from dbo.Tbl_Serials inside the caller's transaction.
 * `UPDLOCK, HOLDLOCK` (the same pair the QR order code uses) keeps two
 * simultaneous orders from ever sharing a number.
 *
 * Exported so the allocation rules can be tested against a fake transaction
 * (this build machine never has the restaurant database).
 */
export async function takeSerial(tx: Tx, shape: SerialsShape, args: SerialArgs) {
  const today = sriLankaDay();
  const where = shape.loc ? "SeriCode = @code AND LocCode = @loc" : "SeriCode = @code";
  const loc = (args.locCode ?? "").slice(0, 10);
  const bind = (request: TxRequest) => {
    const bound = request.input("code", args.code);
    return shape.loc ? bound.input("loc", loc) : bound;
  };

  const found = await bind(tx.request()).query<{ SeriNo: unknown; SeriDate?: unknown }>(
    // CONVERT(…, 23) gives 'YYYY-MM-DD', so the day never arrives as a Date object.
    `SELECT ${shape.date ? "CONVERT(char(10), SeriDate, 23) AS SeriDate, " : ""}SeriNo
       FROM dbo.Tbl_Serials WITH (UPDLOCK, HOLDLOCK)
      WHERE ${where}`,
  );

  let row = found.recordset?.[0];
  if (!row) {
    // No counter for this code yet: start at zero, then bump it below.
    const columns = ["SeriCode", "SeriNo"];
    const values = ["@code", "0"];
    if (shape.date) {
      columns.push("SeriDate");
      values.push("@today");
    }
    if (shape.loc) {
      columns.push("LocCode");
      values.push("@loc");
    }
    try {
      const request = bind(tx.request()).input("today", today.iso);
      await request.query(
        `INSERT INTO dbo.Tbl_Serials (${columns.join(", ")}) VALUES (${values.join(", ")})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Tbl_Serials has no '${args.code}' row and it could not be created: ${message}`);
    }
    row = { SeriNo: 0, SeriDate: today.iso };
  }

  const priorRaw = row.SeriNo;
  const priorText = String(priorRaw ?? "");
  const priorDate = isoDayOf(row.SeriDate);
  const number = nextCounter(priorRaw, priorDate, today.iso, Boolean(args.daily));

  const label = args.format
    ? args.format(number)
    : args.badge
      ? labelSerial(String(number), args.badge)
      : String(number);

  // What goes back into SeriNo: a counter, unless the row already holds a
  // lettered value ("DL-0007") — then keep that style.
  let stored = String(number);
  if (/[A-Za-z]/.test(priorText)) stored = args.format ? label : bumpSerial(priorRaw);
  else if (/^\d+$/.test(priorText) && priorText.length > stored.length) {
    stored = stored.padStart(priorText.length, "0");
  }

  const sets = ["SeriNo = @next"];
  if (shape.date) sets.push("SeriDate = @today");
  await bind(tx.request())
    .input("next", stored)
    .input("today", today.iso)
    .query(`UPDATE dbo.Tbl_Serials SET ${sets.join(", ")} WHERE ${where}`);

  return { number, label, stored };
}

/**
 * Writes the cart to dbo.Tbl_holdUpsCloudTempOO.
 * Prices always come from the menu view, never from the browser.
 */
export async function saveWebOrder(
  order: WebOrderInput,
): Promise<{ ok: true; result: WebOrderResult } | { ok: false; error: WebOrderFailure }> {
  const sql = await loadSql();
  if (!sql) {
    return {
      ok: false,
      error: { kind: "not-configured", message: "The SQL driver is not installed on the server (npm install mssql)." },
    };
  }
  if (!isDbConfigured()) {
    return {
      ok: false,
      error: { kind: "not-configured", message: "The database is not configured (.env)." },
    };
  }

  // 1. Prices and availability straight from the menu view.
  let menu: MenuItem[];
  try {
    menu = await readMenuItems();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: "database", message: `The menu could not be read: ${message}` } };
  }
  const byCode = new Map(menu.map((item) => [item.id, item]));
  const unknown = order.items.filter((line) => !byCode.has(line.itemCode));
  if (unknown.length) {
    return {
      ok: false,
      error: {
        kind: "items-changed",
        message: "Some dishes are no longer available. Please check the cart.",
        changed: unknown.map((line) => ({ itemCode: line.itemCode })),
      },
    };
  }

  const priced = order.items.map((line) => {
    const dish = byCode.get(line.itemCode)!;
    const price = Number(dish.price) || 0;
    return { ...line, name: dish.name, price, lineTotal: price * line.qty };
  });
  const subtotal = priced.reduce((sum, line) => sum + line.lineTotal, 0);
  const deliveryFee = order.orderType === "DL" ? DELIVERY_FEE : 0;

  const pool = (await getPool()) as unknown as { transaction(): Tx; request(): TxRequest };

  // Which optional columns the two tables have — read once, outside the transaction.
  let shape: SerialsShape;
  let orderShape: OrderTableShape;
  try {
    shape = await readSerialsShape(pool);
    orderShape = await readOrderShape(pool);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/could not be read/i.test(message)) {
      return {
        ok: false,
        error: {
          kind: "table-missing",
          message: `${WEB_ORDER_TABLE} does not exist yet. Run: npm run db:order`,
        },
      };
    }
    return { ok: false, error: { kind: "database", message } };
  }

  const tx = pool.transaction();

  try {
    await tx.begin();

    // 1b. Which restaurant this order belongs to (code for POS, name for the guest).
    const place = await resolveLocation(tx, order.locCode, order.customerLocation ?? "");

    // 2. The numbers, from Tbl_Serials inside the same transaction — the very
    //    same rules as the QR order code.
    const today = sriLankaDay();

    //    OrderNo: a plain number, a fresh one for every confirm.
    const orderNo = String(
      (await takeSerial(tx, shape, { code: "ODN", locCode: place.code })).number,
    );

    //    TabelNo: the number the guest reads — DL-0001 / PU-0001.
    const tabelCode = order.orderType === "DL" ? "DL" : "PU";
    const tabelNo = (
      await takeSerial(tx, shape, { code: tabelCode, locCode: place.code, badge: tabelCode })
    ).label;

    //    InvoiceNo: INV-20261025-001 — resets on a new day when SeriDate exists.
    //
    //    One bill, one invoice number: if the counter hands back a number that
    //    another order already owns (a wiped 'INV' row, a restored backup), take
    //    the next one instead of writing a second bill under the same number.
    const takeInvoice = () =>
      takeSerial(tx, shape, {
        code: "INV",
        locCode: place.code,
        daily: true,
        format: (counter) => composeInvoice(counter, today.compact),
      });
    let invoice = await takeInvoice();
    for (let tries = 0; tries < 10; tries += 1) {
      const used = await tx
        .request()
        .input("invoiceNo", TEXT(invoice.label, 50))
        .input("tabelNo", TEXT(tabelNo, 10))
        .query<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${WEB_ORDER_TABLE} WITH (TABLOCKX, HOLDLOCK)
            WHERE InvoiceNo = @invoiceNo AND TabelNo <> @tabelNo`,
        );
      if (Number(used.recordset?.[0]?.n ?? 0) === 0) break;
      invoice = await takeInvoice();
    }
    const invoiceNo = invoice.label;

    // 3. The next RowLine in the web table (POS reads/deletes these rows itself).
    const maxRow = await tx
      .request()
      .query<{ MaxRowLine: number | null }>(
        `SELECT ISNULL(MAX(RowLine), 0) AS MaxRowLine FROM ${WEB_ORDER_TABLE} WITH (TABLOCKX, HOLDLOCK)`,
      );
    let rowLine = Number(maxRow.recordset?.[0]?.MaxRowLine ?? 0);

    // 4. One row per dish.
    for (const line of priced) {
      rowLine += 1;
      const request = tx
        .request()
        .input("locCode", place.code.slice(0, 10))
        .input("tabelNo", TEXT(tabelNo, 10))
        .input("orderNo", TEXT(orderNo, 10))
        .input("itemCode", TEXT(line.itemCode, 10))
        .input("qty", line.qty)
        .input("remark", TEXT(line.remark, 500))
        .input("orderType", TEXT(order.orderType, 5))
        .input("salesPrice", line.price)
        .input("invoiceNo", TEXT(invoiceNo, 50))
        .input("cusName", TEXT(order.customerName, 200))
        .input("cusCode", "")
        .input("rowLine", rowLine)
        .input("scheduleDate", order.scheduleDate)
        .input("scheduleTime", order.scheduleTime)
        .input("cusPhone", TEXT(order.customerPhone, 20))
        .input("cusAddress", TEXT(order.customerAddress, 300))
        .input("cusLoc", TEXT(place.name, 100))
        .input("deliveryFee", deliveryFee)
        .input("orderNote", TEXT(order.orderNote, 500));

      // ScheduleDateTime is written only when the table keeps it as a plain
      // column; on a copy where it is computed, SQL Server does it itself.
      const extraColumn = orderShape.scheduleDateTime ? ", ScheduleDateTime" : "";
      const extraValue = orderShape.scheduleDateTime
        ? ", DATEADD(MINUTE, DATEDIFF(MINUTE, 0, CAST(@scheduleTime AS time(7))), CAST(@scheduleDate AS datetime))"
        : "";

      await request.query(`
          INSERT INTO ${WEB_ORDER_TABLE}
            (LocCode, TabelNo, OrderNo, UserID, UserName, AOR, ItemCode, QTY, ItemRemarks,
             TabelGrpID, TxnDateTime, LPax, FPax, MgrID, OrderType, SalesPrice, VoidRemark,
             InvoiceNo, IsPaid, CusName, CusCode, RowLine,
             ScheduleDate, ScheduleTime${extraColumn}, CusPhone, CusAddress, CusLoc,
             DeliveryFee, OrderNote)
          VALUES
            (@locCode, @tabelNo, @orderNo, 'WEB', 'WEB', 'A', @itemCode, @qty, @remark,
             '', DATEADD(MINUTE, 330, GETUTCDATE()), 0, 0, '', @orderType, @salesPrice, '',
             @invoiceNo, 0, @cusName, @cusCode, @rowLine,
             @scheduleDate, @scheduleTime${extraValue}, @cusPhone, @cusAddress, @cusLoc,
             @deliveryFee, @orderNote)
        `);
    }

    await tx.commit();

    return {
      ok: true,
      result: {
        tabelNo,
        orderNo,
        invoiceNo,
        orderType: order.orderType,
        lines: priced.length,
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
      },
    };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      /* the transaction may already be gone */
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/Invalid object name/i.test(message)) {
      return {
        ok: false,
        error: {
          kind: "table-missing",
          message: `${WEB_ORDER_TABLE} does not exist yet. Run: npm run db:order`,
        },
      };
    }
    return { ok: false, error: { kind: "database", message } };
  }
}
