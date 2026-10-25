/** The request shape the rest of the project uses (two-argument `input`). */
type SqlRequest = {
  input(name: string, value: unknown): SqlRequest;
  query<T>(statement: string): Promise<{ recordset?: T[]; rowsAffected?: number[] }>;
};

/**
 * The customer code, taken from the restaurant's own counter.
 *
 * dbo.Tbl_TxnNumbers holds one row per kind of number:
 *
 *   LoCCode  TxnType  Prefix  TxnNo  TxnDescription   Enable
 *   01       CC       A       3      Create Customer   true
 *
 * A new web account reads that row, takes the next number, writes it back and
 * wears the label `Prefix + number padded to six` — so the third customer is
 * A000004 if TxnNo already stood at 3. The read is under UPDLOCK, HOLDLOCK
 * inside the same transaction as the INSERT, which is what keeps two guests
 * signing up at the same second from ever sharing a code.
 */

export const SEQ_TABLE = process.env.CUSTOMER_SEQ_TABLE?.trim() || "dbo.Tbl_TxnNumbers";
/** `CC` = Create Customer in the POS. */
export const SEQ_TYPE = process.env.CUSTOMER_SEQ_TYPE?.trim() || "CC";
export const SEQ_LOCATION = process.env.WEB_LOC_CODE?.trim() || "01";
export const SEQ_PADDING = Number(process.env.CUSTOMER_SEQ_PADDING || 6);

type SqlTx = {
  begin(): Promise<unknown>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
  request(): SqlRequest;
};

export type SequenceFailure =
  | { kind: "not-set-up"; message: string }
  | { kind: "database"; message: string };

/** `A` + `4` → `A000004`. A number already longer than the padding is kept whole. */
export function formatCustomerCode(prefix: string, counter: number, padding = SEQ_PADDING): string {
  const digits = String(Math.trunc(counter)).padStart(Math.max(1, padding), "0");
  return `${prefix}${digits}`.slice(0, 10); // CusCode is char(10)
}

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : value ? String(value).trim() : "");

/**
 * Takes the next customer code inside the caller's transaction.
 *
 * Never invents a number: if the row is missing, disabled, or the table cannot
 * be read, it says so plainly instead of writing a placeholder into the book.
 */
export async function allocateCustomerCode(
  tx: SqlTx,
  location = SEQ_LOCATION,
): Promise<{ ok: true; code: string; counter: number } | { ok: false; error: SequenceFailure }> {
  let row: { Prefix?: unknown; TxnNo?: unknown; Enable?: unknown } | undefined;

  try {
    const found = await tx
      .request()
      .input("loc", location)
      .input("type", SEQ_TYPE)
      .query<{ Prefix?: unknown; TxnNo?: unknown; Enable?: unknown }>(
        `SELECT TOP 1 LTRIM(RTRIM(Prefix)) AS Prefix, TxnNo, Enable
           FROM ${SEQ_TABLE} WITH (UPDLOCK, HOLDLOCK)
          WHERE LTRIM(RTRIM(LoCCode)) = @loc AND LTRIM(RTRIM(TxnType)) = @type`,
      );
    row = found.recordset?.[0];
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    console.error(`[customer] ${SEQ_TABLE} could not be read: ${message}`);
    return {
      ok: false,
      error: {
        kind: "not-set-up",
        message: "Customer numbering could not be read. Please call the restaurant.",
      },
    };
  }

  if (!row) {
    console.error(`[customer] ${SEQ_TABLE} has no row for ${location} / ${SEQ_TYPE}`);
    return {
      ok: false,
      error: {
        kind: "not-set-up",
        message: "Customer numbering is not set up yet. Please call the restaurant.",
      },
    };
  }

  const enabled = row.Enable === true || row.Enable === 1 || clean(row.Enable) === "1";
  if (!enabled) {
    console.error(`[customer] ${SEQ_TABLE} row for ${location} / ${SEQ_TYPE} is disabled`);
    return {
      ok: false,
      error: {
        kind: "not-set-up",
        message: "Customer numbering is switched off. Please call the restaurant.",
      },
    };
  }

  const prior = Number(row.TxnNo ?? 0);
  const counter = (Number.isFinite(prior) ? Math.trunc(prior) : 0) + 1;
  const code = formatCustomerCode(clean(row.Prefix) || "A", counter);

  try {
    await tx
      .request()
      .input("loc", location)
      .input("type", SEQ_TYPE)
      .input("next", counter)
      .query(
        `UPDATE ${SEQ_TABLE}
            SET TxnNo = @next
          WHERE LTRIM(RTRIM(LoCCode)) = @loc AND LTRIM(RTRIM(TxnType)) = @type`,
      );
  } catch (error) {
    console.error("[customer] the counter could not be written back:", (error as Error)?.message);
    return {
      ok: false,
      error: { kind: "database", message: "We couldn’t open your account just now. Please try again." },
    };
  }

  return { ok: true, code, counter };
}

/** The table and row the numbering needs, for `npm run otp:setup` to report. */
export const SEQUENCE_CHECK_SQL = `
  SELECT LTRIM(RTRIM(LoCCode)) AS LoCCode, LTRIM(RTRIM(TxnType)) AS TxnType,
         LTRIM(RTRIM(Prefix)) AS Prefix, TxnNo, Enable
    FROM ${SEQ_TABLE}
   WHERE LTRIM(RTRIM(LoCCode)) = '${SEQ_LOCATION}' AND LTRIM(RTRIM(TxnType)) = '${SEQ_TYPE}'`;
