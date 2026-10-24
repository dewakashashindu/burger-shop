import { getPool, isDbConfigured, loadSql } from "./db";
import { readMenuItems, type MenuItem } from "./menu-source";

/**
 * The ONLY place this website writes to the restaurant database.
 *
 * Cart → confirm → dbo.Tbl_holdUpsCloudTempWeb (one row per dish).
 * Nothing else is written: Tbl_HoldUpsCloud, Tbl_HoldUpsCloudTemp and the QR
 * table stay untouched. Tbl_Serials is only incremented for the three numbers
 * the note asks for (INV, ODN, DL / PU).
 */

export const WEB_ORDER_TABLE = "dbo.Tbl_holdUpsCloudTempWeb";
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

type TxRequest = {
  input(name: string, value: unknown): TxRequest;
  query<T>(statement: string): Promise<{ recordset?: T[]; rowsAffected?: number[] }>;
};

type Tx = {
  begin(): Promise<unknown>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
  request(): TxRequest;
};

async function nextSerial(tx: Tx, code: string): Promise<string> {
  const found = await tx
    .request()
    .input("code", code)
    .query<{ SeriNo: unknown }>(
      "SELECT SeriNo FROM dbo.Tbl_Serials WITH (UPDLOCK, ROWLOCK) WHERE SeriCode = @code",
    );

  let current: unknown = found.recordset?.[0]?.SeriNo;

  if (!found.recordset?.length) {
    // First web order for this code: create the counter at zero, then bump it.
    try {
      await tx.request().input("code", code).query(
        "INSERT INTO dbo.Tbl_Serials (SeriCode, SeriNo) VALUES (@code, 0)",
      );
      current = 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Tbl_Serials has no '${code}' row and it could not be created: ${message}`);
    }
  }

  const next = bumpSerial(current);
  await tx.request().input("code", code).input("next", next).query(
    "UPDATE dbo.Tbl_Serials SET SeriNo = @next WHERE SeriCode = @code",
  );
  return next;
}

/**
 * Writes the cart to dbo.Tbl_holdUpsCloudTempWeb.
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

  const pool = (await getPool()) as unknown as { transaction(): Tx };
  const tx = pool.transaction();

  try {
    await tx.begin();

    // 1b. Which restaurant this order belongs to (code for POS, name for the guest).
    const place = await resolveLocation(tx, order.locCode, order.customerLocation ?? "");

    // 2. The three numbers, from Tbl_Serials inside the same transaction.
    const invoiceNo = await nextSerial(tx, "INV");
    const orderNo = await nextSerial(tx, "ODN");
    // TabelNo is the one number the guest sees: DL-0001 / PU-0001.
    const tabelCode = order.orderType === "DL" ? "DL" : "PU";
    const tabelNo = labelSerial(await nextSerial(tx, tabelCode), tabelCode);

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
      await tx
        .request()
        .input("locCode", place.code)
        .input("tabelNo", tabelNo)
        .input("orderNo", orderNo)
        .input("itemCode", line.itemCode)
        .input("qty", line.qty)
        .input("remark", line.remark ?? "")
        .input("orderType", order.orderType)
        .input("salesPrice", line.price)
        .input("invoiceNo", invoiceNo)
        .input("cusName", order.customerName)
        .input("cusCode", "")
        .input("rowLine", rowLine)
        .input("scheduleDate", order.scheduleDate)
        .input("scheduleTime", order.scheduleTime)
        .input("cusPhone", order.customerPhone)
        .input("cusAddress", order.customerAddress ?? "")
        .input("cusLoc", place.name)
        .input("deliveryFee", deliveryFee)
        .input("orderNote", order.orderNote ?? "")
        .query(`
          INSERT INTO ${WEB_ORDER_TABLE}
            (LocCode, TabelNo, OrderNo, UserID, UserName, AOR, ItemCode, QTY, ItemRemarks,
             TabelGrpID, TxnDateTime, LPax, FPax, MgrID, OrderType, SalesPrice, VoidRemark,
             InvoiceNo, IsPaid, CusName, CusCode, RowLine,
             ScheduleDate, ScheduleTime, CusPhone, CusAddress, CusLoc, DeliveryFee, OrderNote)
          VALUES
            (@locCode, @tabelNo, @orderNo, 'WEB', 'WEB', 'A', @itemCode, @qty, @remark,
             '', DATEADD(MINUTE, 330, GETUTCDATE()), 0, 0, '', @orderType, @salesPrice, '',
             @invoiceNo, 0, @cusName, @cusCode, @rowLine,
             @scheduleDate, @scheduleTime, @cusPhone, @cusAddress, @cusLoc, @deliveryFee, @orderNote)
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
