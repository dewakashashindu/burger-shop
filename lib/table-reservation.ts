import { getPool, isDbConfigured, loadSql } from "./db";
import { allocateTxnNumber } from "./txn-number";
import type { TxRequest } from "./web-order";

/**
 * The one place a table booking is written: dbo.Tbl_TabelReservation.
 *
 * Nothing else in the POS tables is touched. The booking number comes from the
 * restaurant's own counter, dbo.Tbl_TxnNumbers — the row `LoCCode 01 ·
 * TxnType RV · Prefix T`, which the desk calls "TABEL RESERVATION". With that
 * row standing at 12 the next booking is T000013 and the row is left at 13.
 *
 * The number is taken inside the same transaction as the INSERT, under
 * `UPDLOCK, HOLDLOCK`, so two guests pressing "Confirm" at the same second can
 * never share a booking id — and if the row is missing or switched off the
 * booking is refused rather than given an invented number.
 */

export const RESERVATION_TABLE = "dbo.Tbl_TabelReservation";

export type ReservationInput = {
  locCode: string;
  tableNo: string;
  groupName: string;
  date: string; // YYYY-MM-DD (Sri Lanka day)
  timeFrom: string; // HH:mm
  timeTo: string; // HH:mm
  pax: number;
  customerName: string;
  customerPhone: string;
  /** The signed-in guest's email — the confirmation goes there when it is known. */
  customerEmail?: string;
  note?: string;
};

export type ReservationResult =
  | { ok: true; reservation: { resId: string; locCode: string; tableNo: string; date: string; timeFrom: string; timeTo: string } }
  | { ok: false; error: { kind: "invalid" | "not-configured" | "taken" | "database"; message: string } };

const TEXT = (value: unknown, max: number) => (typeof value === "string" ? value : "").trim().slice(0, max);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `19:00` + `21:00` on a given day, as the two datetime columns the POS expects. */
function at(date: string, time: string) {
  return `${date} ${time}:00`;
}

export async function createTableReservation(input: ReservationInput): Promise<ReservationResult> {
  const tableNo = TEXT(input.tableNo, 50);
  const date = TEXT(input.date, 10);
  const from = TEXT(input.timeFrom, 5);
  const to = TEXT(input.timeTo, 5);
  const pax = Math.max(1, Math.floor(Number(input.pax) || 0));

  if (!tableNo) return { ok: false, error: { kind: "invalid", message: "Choose a table." } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: { kind: "invalid", message: "Choose a date." } };
  if (!HHMM.test(from) || !HHMM.test(to) || to <= from)
    return { ok: false, error: { kind: "invalid", message: "Choose a time period that ends after it starts." } };

  const sql = await loadSql();
  if (!sql) return { ok: false, error: { kind: "not-configured", message: "The reservation system is not connected." } };
  if (!isDbConfigured()) return { ok: false, error: { kind: "not-configured", message: "The reservation system is not connected." } };

  const pool = (await getPool()) as unknown as { transaction(): { begin(): Promise<unknown>; commit(): Promise<unknown>; rollback(): Promise<unknown>; request(): TxRequest }; request(): TxRequest };

  const tx = pool.transaction();
  try {
    await tx.begin();

    // 1. One booking per table per period. A table held for 19:00–21:00 cannot
    //    be held again for 20:00–22:00 on the same day.
    const clashes = await tx
      .request()
      .input("tableNo", tableNo)
      .input("txnDate", date)
      .input("from", at(date, from))
      .input("to", at(date, to))
      .query<{ Clashes: number }>(
        `SELECT COUNT(*) AS Clashes
           FROM ${RESERVATION_TABLE} WITH (UPDLOCK, HOLDLOCK)
          WHERE LTRIM(RTRIM(TableNo)) = LTRIM(RTRIM(@tableNo))
            AND ISNULL(Cancel, 0) = 0
            AND Txndate = @txnDate
            AND TimeFrom < @to
            AND TimeTo   > @from`,
      );

    if (Number(clashes.recordset?.[0]?.Clashes ?? 0) > 0) {
      await tx.rollback();
      return { ok: false, error: { kind: "taken", message: "That table is already held for this time. Choose another period or table." } };
    }

    // 2. The booking number, from dbo.Tbl_TxnNumbers (row RV) — T000013, T000014 …
    const number = await allocateTxnNumber(tx, "table", { locCode: TEXT(input.locCode, 10) });
    if (!number.ok) {
      await tx.rollback();
      return { ok: false, error: { kind: "not-configured", message: number.error.message } };
    }
    const resId = number.number.slice(0, 10);

    // 3. The booking itself.
    const remarks = [input.groupName ? `Web · ${input.groupName}` : "Web booking", TEXT(input.note, 600)].filter(Boolean).join(" · ").slice(0, 800);

    await tx
      .request()
      .input("locCode", TEXT(input.locCode, 10))
      .input("resId", resId)
      .input("tableNo", tableNo)
      .input("txnDate", date)
      .input("timeFrom", at(date, from))
      .input("timeTo", at(date, to))
      .input("cusCode", "")
      .input("remarks", remarks)
      .input("pax", pax)
      .query(
        `INSERT INTO ${RESERVATION_TABLE}
           (LocCode, ResID, TableNo, Txndate, TimeFrom, TimeTo, CusCode, ResRemarks, Pax, Cancel,
            ReservedBy, ReservedDate, CancelledRmks, CancelledUser, CancelledDateTime)
         VALUES
           (@locCode, @resId, @tableNo, @txnDate, @timeFrom, @timeTo, @cusCode, @remarks, @pax, 0,
            'WEB', GETDATE(), '', '', '1900-01-01')`,
      );

    await tx.commit();
    return { ok: true, reservation: { resId, locCode: TEXT(input.locCode, 10), tableNo, date, timeFrom: from, timeTo: to } };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      /* already rolled back (the clash branch) */
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: "database", message } };
  }
}
