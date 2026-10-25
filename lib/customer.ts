import { getPool, isDbConfigured } from "./db";
import { digitsOf, lastNine, localPhone } from "./phone";
import { allocateCustomerCode, formatCustomerCode } from "./customer-code";
import {
  buildCustomerInsert,
  buildCustomerSelect,
  buildCustomerUpdate,
  shapeFromColumns,
  splitTableName,
  type CustomerShape,
} from "./customer-sql";

/** The pool, seen the way the rest of the project sees it (2-arg `input`). */
type SqlReq = {
  input(name: string, value: unknown): SqlReq;
  query<T>(statement: string): Promise<{ recordset?: T[]; rowsAffected?: number[] }>;
};
type SqlTx = {
  begin(): Promise<unknown>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
  request(): SqlReq;
};
type SqlPool = { request(): SqlReq };
type SqlPoolTx = SqlPool & { transaction(): SqlTx };
const poolOf = async () => (await getPool()) as unknown as SqlPool;


/**
 * The guests' own book: dbo.Tbl_CustomerMaster.
 *
 * The phone number is how a person is found (by the last nine digits of
 * RegTel). The customer code comes from the restaurant's own counter,
 * dbo.Tbl_TxnNumbers — `A000004` and so on — allocated in the same
 * transaction as the INSERT, so it is a real POS code and never repeats.
 * Write: one new row on sign-up, and name / email / address back on an edit.
 * The phone number itself is never changed once the account exists.
 */

export const CUSTOMER_TABLE = process.env.CUSTOMER_TABLE?.trim() || "dbo.Tbl_CustomerMaster";
export const WEB_LOC_CODE = process.env.WEB_LOC_CODE?.trim() || "01";
/**
 * Only used when there is no counter to read: a fixed code, if someone wants
 * accounts parked on one. The normal path is dbo.Tbl_TxnNumbers.
 */
export const WEB_CUS_CODE = process.env.WEB_CUS_CODE ?? "";

export type Customer = {
  locCode: string;
  cusCode: string;
  name: string;
  phone: string; // local, 0772336233
  email: string;
  adds: string[]; // always four slots, empty strings allowed
};

export type CustomerFailure =
  | { kind: "not-configured"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "exists"; message: string; customer: Customer }
  | { kind: "code-clash"; message: string }
  | { kind: "numbering"; message: string }
  | { kind: "database"; message: string };

type Row = Record<string, unknown>;
const CLEAN = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const TEXT = (value: unknown, max: number) => CLEAN(value).slice(0, max);

const PHONE_MATCH =
  "RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(RegTel,' ',''),'-',''),'(',''),')',''),'+',''), 9) = @phone";

/**
 * Which columns dbo.Tbl_CustomerMaster actually has, read once per process.
 *
 * The POS owns this table and its columns differ between installs (the live
 * one has no `CusWeb`), so no statement names a column until this has answered.
 * `forgetCustomerShape()` drops the cache — the writer calls it when SQL Server
 * says a column is unknown, so a schema change heals itself on the next try.
 */
type ShapeStore = typeof globalThis & { __milaCustomerShape?: Promise<CustomerShape> };
const shapeStore = globalThis as ShapeStore;

export function forgetCustomerShape() {
  shapeStore.__milaCustomerShape = undefined;
}

async function customerShape(): Promise<CustomerShape> {
  if (!shapeStore.__milaCustomerShape) {
    shapeStore.__milaCustomerShape = (async () => {
      const { schema, table } = splitTableName(CUSTOMER_TABLE);
      const pool = await poolOf();
      const found = await pool
        .request()
        .input("schema", schema)
        .input("table", table)
        .query<{ COLUMN_NAME: string }>(
          `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table`,
        );
      const names = (found.recordset ?? []).map((row) => row.COLUMN_NAME);
      if (!names.length) {
        throw new Error(`Tbl_CustomerMaster could not be read: no columns for ${CUSTOMER_TABLE}`);
      }
      return shapeFromColumns(names);
    })().catch((error) => {
      shapeStore.__milaCustomerShape = undefined; // try again next time
      throw error;
    });
  }
  return shapeStore.__milaCustomerShape;
}

const isUnknownColumn = (error: unknown) =>
  (error as { number?: number })?.number === 207 ||
  /invalid column name/i.test((error as Error)?.message ?? "");
const isMissingValue = (error: unknown) => (error as { number?: number })?.number === 515;

export function readCustomer(row: Row | undefined): Customer | null {
  if (!row) return null;
  const phone = localPhone(row.RegTel);
  const name = CLEAN(row.CusName);
  if (!phone || !name) return null;
  return {
    locCode: CLEAN(row.LoCCode),
    cusCode: CLEAN(row.CusCode),
    name,
    phone,
    email: CLEAN(row.CusEmail),
    adds: [CLEAN(row.CusAdd1), CLEAN(row.CusAdd2), CLEAN(row.CusAdd3), CLEAN(row.CusAdd4)],
  };
}

/* ------------------------------------------------------------------ *
 * A development book, used only when WEB_AUTH_DEV=1 and no database
 * is configured. It lets the whole flow be walked through locally
 * (and by the test suites) without a SQL Server.
 * ------------------------------------------------------------------ */
type MemoryBook = { customers: Map<string, Customer & { createdAt: number }>; counter: number };
const memory = globalThis as typeof globalThis & { __milaCustomerBook?: MemoryBook };
const book = (): MemoryBook => (memory.__milaCustomerBook ??= { customers: new Map(), counter: 0 });
/** In the dev book the counter behaves exactly like `CC` in Tbl_TxnNumbers. */
const takeDevCode = () => formatCustomerCode(process.env.WEB_CUS_PREFIX || "A", ++book().counter);

export const devBook = () => book().customers;
export const usesDevBook = () =>
  process.env.WEB_AUTH_DEV === "1" && !isDbConfigured();

/** Seeds nothing in production; the suites add their own rows. */
export function resetDevBook() {
  book().customers.clear();
  book().counter = 0;
}

function devFind(nine: string): Customer | null {
  const row = book().customers.get(nine);
  if (!row) return null;
  const { createdAt: _created, ...customer } = row;
  return customer;
}

/* ------------------------------------------------------------------ */

export async function findCustomer(phone: unknown): Promise<Customer | null> {
  const nine = lastNine(phone);
  if (!nine) return null;

  if (usesDevBook()) return devFind(nine);

  const shape = await customerShape();
  const pool = await poolOf();
  const found = await pool
    .request()
    .input("phone", nine)
    .query<Row>(buildCustomerSelect(CUSTOMER_TABLE, shape));
  return readCustomer(found.recordset?.[0]);
}

export type NewCustomer = {
  name: string;
  phone: string;
  adds: string[];
  email?: string;
};

export async function createCustomer(
  input: NewCustomer,
): Promise<{ ok: true; customer: Customer } | { ok: false; error: CustomerFailure }> {
  const nine = lastNine(input.phone);
  const local = localPhone(input.phone);

  if (!nine || !local) {
    return { ok: false, error: { kind: "invalid", message: "Enter a valid Sri Lankan mobile number." } };
  }
  if (input.name.trim().length < 2) {
    return { ok: false, error: { kind: "invalid", message: "Please enter your name." } };
  }
  const adds = [0, 1, 2, 3].map((i) => TEXT(input.adds[i], 200));
  if (!adds[0]) {
    return { ok: false, error: { kind: "invalid", message: "Please enter at least the first line of your address." } };
  }
  const email = TEXT(input.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: { kind: "invalid", message: "That email address doesn’t look right." } };
  }

  const existing = await findCustomer(nine);
  if (existing) {
    return { ok: false, error: { kind: "exists", message: "This number already has an account.", customer: existing } };
  }

  const details = {
    locCode: WEB_LOC_CODE,
    name: TEXT(input.name, 200),
    phone: local,
    email,
    adds,
  };

  if (usesDevBook()) {
    if (book().customers.has(nine)) {
      return { ok: false, error: { kind: "exists", message: "This number already has an account.", customer: devFind(nine)! } };
    }
    const customer: Customer = { ...details, cusCode: CLEAN(WEB_CUS_CODE) || takeDevCode() };
    book().customers.set(nine, { ...customer, createdAt: Date.now() });
    return { ok: true, customer };
  }

  const pool = (await poolOf()) as unknown as SqlPoolTx;

  // Up to three tries: the counter and the book can drift apart (a code was
  // taken by the POS in the meantime), and each retry asks for a fresh code.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let shape: CustomerShape;
    try {
      shape = await customerShape();
    } catch (error) {
      console.error("[customer] the book's columns could not be read:", (error as Error)?.message);
      return {
        ok: false,
        error: { kind: "database", message: "We couldn’t open your account just now. Please try again." },
      };
    }

    const tx = pool.transaction();
    try {
      await tx.begin();

      const taken = await allocateCustomerCode(tx);
      if (!taken.ok) {
        await tx.rollback().catch(() => {});
        return { ok: false, error: { kind: taken.error.kind === "database" ? "database" : "numbering", message: taken.error.message } };
      }

      const statement = buildCustomerInsert(CUSTOMER_TABLE, shape, {
        locCode: details.locCode,
        cusCode: taken.code,
        name: details.name,
        adds: details.adds as [string, string, string, string],
        phone: details.phone,
        email: details.email,
      });

      const request = tx.request();
      for (const [name, value] of Object.entries(statement.params)) request.input(name, value);
      await request.query(statement.sql);

      await tx.commit();
      return { ok: true, customer: { ...details, cusCode: taken.code } };
    } catch (error) {
      await tx.rollback().catch(() => {});
      const number = (error as { number?: number })?.number;

      // The shape was wrong (a column added or dropped since it was read):
      // forget it and try once more with the table as it is now.
      if (isUnknownColumn(error)) {
        console.warn("[customer] a column in the book changed — re-reading its shape");
        forgetCustomerShape();
        continue;
      }

      // 2627 / 2601 — that code (or that phone) is already in the book. A code
      // clash is worth another round; a duplicate phone means a real account.
      if (number === 2627 || number === 2601) {
        const already = await findCustomer(nine);
        if (already) {
          return { ok: false, error: { kind: "exists", message: "This number already has an account.", customer: already } };
        }
        console.warn("[customer] code already in use, asking the counter again");
        continue;
      }

      if (isMissingValue(error)) {
        // A NOT NULL column with no default that the web has no value for.
        console.error("[customer] the book needs a column the website does not fill:", (error as Error)?.message);
        return {
          ok: false,
          error: {
            kind: "numbering",
            message: "Your account couldn’t be opened just now. Please call the restaurant and we’ll add you by hand.",
          },
        };
      }

      console.error("[customer] insert failed:", (error as Error)?.message);
      return {
        ok: false,
        error: { kind: "database", message: "We couldn’t open your account just now. Please try again." },
      };
    }
  }

  return {
    ok: false,
    error: {
      kind: "code-clash",
      message: "This account could not be added: the customer number is out of step. Please call the restaurant.",
    },
  };
}

/**
 * The details a guest may change on their own account: name, email and the
 * four address lines. The phone number is the key and stays as it is.
 */
export async function updateCustomer(
  phone: unknown,
  patch: { name?: string; email?: string; adds?: string[] },
): Promise<{ ok: true; customer: Customer } | { ok: false; error: CustomerFailure }> {
  const nine = lastNine(phone);
  if (!nine) return { ok: false, error: { kind: "invalid", message: "That number is not valid." } };

  const current = await findCustomer(nine);
  if (!current) return { ok: false, error: { kind: "invalid", message: "No account with this number." } };

  const name = patch.name !== undefined ? TEXT(patch.name, 200) : current.name;
  if (name.length < 2) return { ok: false, error: { kind: "invalid", message: "Please enter your name." } };

  const email = patch.email !== undefined ? TEXT(patch.email, 200) : current.email;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: { kind: "invalid", message: "That email address doesn’t look right." } };
  }

  const adds = patch.adds ? [0, 1, 2, 3].map((i) => TEXT(patch.adds![i], 200)) : current.adds;
  if (!adds[0]) return { ok: false, error: { kind: "invalid", message: "Please keep at least one address line." } };

  const next: Customer = { ...current, name, email, adds };

  if (usesDevBook()) {
    book().customers.set(nine, { ...next, createdAt: Date.now() });
    return { ok: true, customer: next };
  }

  // Only the columns the table really has — and only the ones that changed.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const shape = await customerShape();
      const statement = buildCustomerUpdate(CUSTOMER_TABLE, shape, {
        name,
        email,
        adds: adds as [string, string, string, string],
      });
      if (!statement) {
        // Nothing writable changed (the table has none of name/email/address).
        return { ok: true, customer: next };
      }
      const pool = await poolOf();
      const request = pool.request().input("phone", nine);
      for (const [key, value] of Object.entries(statement.params)) request.input(key, value);
      await request.query(statement.sql);
      return { ok: true, customer: next };
    } catch (error) {
      if (attempt === 0 && isUnknownColumn(error)) {
        forgetCustomerShape();
        continue;
      }
      console.error("[customer] update failed:", (error as Error)?.message);
      return {
        ok: false,
        error: { kind: "database", message: "We couldn’t save those details. Please try again." },
      };
    }
  }

  return { ok: false, error: { kind: "database", message: "We couldn’t save those details. Please try again." } };
}

/** For the setup script: does the table look the way the code expects? */
export async function readCustomerShape() {
  const pool = await poolOf();
  const columns = await pool.request().query<{ name: string }>(
    `SELECT c.name FROM sys.columns c WHERE c.object_id = OBJECT_ID('${CUSTOMER_TABLE}')`,
  );
  const keys = await pool.request().query<{ column: string }>(
    `SELECT col.name AS column
       FROM sys.indexes i
       JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
       JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
      WHERE i.object_id = OBJECT_ID('${CUSTOMER_TABLE}') AND i.is_primary_key = 1
      ORDER BY ic.key_ordinal`,
  );
  return {
    columns: (columns.recordset ?? []).map((row) => String(row.name)),
    primaryKey: (keys.recordset ?? []).map((row) => String(row.column)),
    digits: digitsOf(WEB_CUS_CODE).length,
  };
}
