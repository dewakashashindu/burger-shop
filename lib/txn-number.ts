/**
 * Reservation numbers, taken from the restaurant's own counter.
 *
 * dbo.Tbl_TxnNumbers holds one row per kind of number:
 *
 *   LoCCode  TxnType  Prefix  TxnNo  TxnDescription     Enable
 *   01       RV       T       12     TABEL RESERVATION  true
 *
 * A new booking reads that row, takes the next number, writes it back and
 * wears the label `Prefix + number padded to six` — so with TxnNo standing at
 * 12 the next reservation is T000013, and the row is left at 13. The read is
 * under UPDLOCK, HOLDLOCK inside the caller's transaction, which is what keeps
 * two guests pressing "Confirm" at the same second from sharing a number.
 *
 * This is the same mechanism `lib/customer-code.ts` uses for the `CC` row; the
 * difference is that this module serves reservations (tables and rooms) and
 * refuses to invent a number when the row is missing or switched off.
 *
 * Nothing here writes a reservation — it only allocates the number the caller
 * then writes into its own table.
 */

/** The request shape the rest of the project uses (two-argument `input`). */
export type TxnRequest = {
  input(name: string, value: unknown): TxnRequest;
  query<T>(statement: string): Promise<{ recordset?: T[]; rowsAffected?: number[] }>;
};

export type TxnTx = {
  request(): TxnRequest;
};

export const TXN_TABLE = process.env.TXN_NUMBERS_TABLE?.trim() || "dbo.Tbl_TxnNumbers";
/** LoCCode 01 is the web location, the same one Tbl_CustomerMaster uses. */
export const TXN_LOCATION = process.env.WEB_LOC_CODE?.trim() || "01";
export const TXN_PADDING = Number(process.env.TXN_SEQ_PADDING || 6);

/**
 * Which row each kind of booking asks for.
 *
 * Both draw from the POS row `RV` (prefix T, "TABEL RESERVATION"): one counter
 * for the restaurant's reservations, table and room alike, which is what the
 * desk expects to see. Give rooms their own row (`RR`, prefix `S`) and set
 * STAY_SEQ_TYPE=RR only if the desk ever asks for a separate series.
 */
export const TXN_TYPE = {
  table: process.env.TABLE_SEQ_TYPE?.trim() || "RV",
  stay: process.env.STAY_SEQ_TYPE?.trim() || "RV",
} as const;

export type TxnPurpose = keyof typeof TXN_TYPE;

export type TxnFailure = {
  kind: "not-set-up" | "database";
  message: string;
};

export type TxnAllocation =
  | { ok: true; number: string; counter: number; prefix: string; description: string; txnType: string; locCode: string }
  | { ok: false; error: TxnFailure };

/** `T` + `13` → `T000013`. A number already longer than the padding is kept whole. */
export function formatTxnNumber(prefix: string, counter: number, padding = TXN_PADDING): string {
  const digits = String(Math.trunc(counter)).padStart(Math.max(1, padding), "0");
  return `${prefix}${digits}`;
}

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : value ? String(value).trim() : "");
const isOn = (value: unknown) => value === true || value === 1 || clean(value) === "1" || clean(value).toLowerCase() === "true";

const LABEL: Record<TxnPurpose, string> = {
  table: "Table booking",
  stay: "Room booking",
};

/**
 * Takes the next reservation number inside the caller's transaction.
 *
 * Never invents one: if the row is missing, switched off, or the table cannot
 * be read or written, it says so plainly — the caller turns that into a short
 * message for the guest instead of a made-up code.
 */
export async function allocateTxnNumber(
  tx: TxnTx,
  purpose: TxnPurpose,
  options: { locCode?: string; padding?: number } = {},
): Promise<TxnAllocation> {
  const locCode = (options.locCode ?? TXN_LOCATION).trim() || TXN_LOCATION;
  const txnType = TXN_TYPE[purpose];
  const padding = options.padding ?? TXN_PADDING;

  let row: { Prefix?: unknown; TxnNo?: unknown; Enable?: unknown; TxnDescription?: unknown } | undefined;
  try {
    const found = await tx
      .request()
      .input("loc", locCode)
      .input("type", txnType)
      .query<{ Prefix?: unknown; TxnNo?: unknown; Enable?: unknown; TxnDescription?: unknown }>(
        `SELECT TOP 1 LTRIM(RTRIM(Prefix)) AS Prefix, TxnNo, Enable, TxnDescription
           FROM ${TXN_TABLE} WITH (UPDLOCK, HOLDLOCK)
          WHERE LTRIM(RTRIM(LoCCode)) = @loc AND LTRIM(RTRIM(TxnType)) = @type`,
      );
    row = found.recordset?.[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[txn-number] ${TXN_TABLE} could not be read: ${message}`);
    return {
      ok: false,
      error: {
        kind: "not-set-up",
        message: `${LABEL[purpose]} numbering could not be read. Please call the restaurant.`,
      },
    };
  }

  if (!row) {
    console.error(`[txn-number] ${TXN_TABLE} has no row for ${locCode} / ${txnType}`);
    return {
      ok: false,
      error: {
        kind: "not-set-up",
        message: `${LABEL[purpose]} numbering is not set up yet (${TXN_TABLE} · ${locCode}/${txnType}). Please call the restaurant.`,
      },
    };
  }

  if (!isOn(row.Enable)) {
    console.error(`[txn-number] ${TXN_TABLE} row for ${locCode} / ${txnType} is disabled`);
    return {
      ok: false,
      error: {
        kind: "not-set-up",
        message: `${LABEL[purpose]} numbering is switched off. Please call the restaurant.`,
      },
    };
  }

  const prior = Number(row.TxnNo ?? 0);
  const counter = (Number.isFinite(prior) ? Math.trunc(prior) : 0) + 1;
  const prefix = clean(row.Prefix);
  const number = formatTxnNumber(prefix, counter, padding);

  try {
    await tx
      .request()
      .input("loc", locCode)
      .input("type", txnType)
      .input("next", counter)
      .query(
        `UPDATE ${TXN_TABLE}
            SET TxnNo = @next
          WHERE LTRIM(RTRIM(LoCCode)) = @loc AND LTRIM(RTRIM(TxnType)) = @type`,
      );
  } catch (error) {
    console.error("[txn-number] the counter could not be written back:", error instanceof Error ? error.message : error);
    return {
      ok: false,
      error: { kind: "database", message: `${LABEL[purpose]} numbering could not be saved. Please try again.` },
    };
  }

  return {
    ok: true,
    number,
    counter,
    prefix,
    description: clean(row.TxnDescription),
    txnType,
    locCode,
  };
}

/** The row the numbering needs, for a setup check to print. */
export function sequenceCheckSql(purpose: TxnPurpose = "stay", locCode = TXN_LOCATION) {
  const trimmed = locCode.replace(/'/g, "''");
  const type = TXN_TYPE[purpose].replace(/'/g, "''");
  return `SELECT LTRIM(RTRIM(LoCCode)) AS LoCCode, LTRIM(RTRIM(TxnType)) AS TxnType,
         LTRIM(RTRIM(Prefix)) AS Prefix, TxnNo, TxnDescription, Enable
    FROM ${TXN_TABLE}
   WHERE LTRIM(RTRIM(LoCCode)) = '${trimmed}' AND LTRIM(RTRIM(TxnType)) = '${type}'`;
}
