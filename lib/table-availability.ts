import { getPool, isDbConfigured, loadSql } from "./db";

/**
 * Which tables are free, from the reservation book itself.
 *
 * The table master (dbo.Tbl_Tables) only knows whether a table is standing in
 * the room; its `Vaccant` flag says nothing about a date or an hour. A table is
 * free for a window when NO live booking on that date overlaps it:
 *
 *     Tbl_TabelReservation.Cancel = 0
 *     AND Txndate = @date
 *     AND TimeFrom < @to        -- overlap
 *     AND TimeTo   > @from
 *
 * That is exactly the rule the INSERT in lib/table-reservation.ts re-checks
 * inside its transaction (UPDLOCK, HOLDLOCK), so what the guest is shown here
 * is what the booking will accept — bar the odd race, which the transaction
 * catches and reports as "that table is already held".
 *
 * One call per date returns the tables AND that day's bookings, so the page can
 * work out availability for any window, and the nearest other times, without a
 * round trip per question.
 */

export type AvailabilityTable = {
  no: string;
  group: string;
  groupName: string;
  seats: number | null;
  listingOrder: number;
};

export type AvailabilityBooking = {
  tableNo: string;
  /** "HH:mm" — the time of day only; the date is the call's date. */
  from: string;
  to: string;
  pax: number;
};

export type Availability = {
  ok: boolean;
  reason?: string;
  date: string;
  tables: AvailabilityTable[];
  bookings: AvailabilityBooking[];
};

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();

const order = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 999999;
};

/**
 * POS builds differ: some carry a seat count on the table row, some do not.
 * The first query names the column; if that build has no such column the second
 * one is used and seats are reported as unknown rather than invented.
 */
const tablesSql = (withSeats: boolean) => `
  SELECT LTRIM(RTRIM(t.TableNo))    AS TableNo,
         LTRIM(RTRIM(t.TableGroup)) AS TableGroup,
         LTRIM(RTRIM(ISNULL(g.GroupName, t.TableGroup))) AS GroupName,
         ${withSeats ? "NULLIF(t.NoOfSeats, 0)" : "NULL"} AS Seats,
         ISNULL(t.ListingOrder, 999999) AS ListingOrder
    FROM dbo.Tbl_Tables AS t WITH (NOLOCK)
    LEFT JOIN dbo.Tbl_TableGroup AS g WITH (NOLOCK)
      ON LTRIM(RTRIM(g.GroupID))   = LTRIM(RTRIM(t.TableGroup))
      OR LTRIM(RTRIM(g.GroupName)) = LTRIM(RTRIM(t.TableGroup))
   WHERE ISNULL(t.Enable, 1) = 1
   ORDER BY ISNULL(g.GroupName, LTRIM(RTRIM(t.TableGroup))) ASC,
            ISNULL(t.ListingOrder, 999999) ASC,
            LTRIM(RTRIM(t.TableNo)) ASC`;

const bookingsSql = `
  SELECT LTRIM(RTRIM(r.TableNo))                       AS TableNo,
         CONVERT(varchar(5), r.TimeFrom, 108)          AS TimeFrom,
         CONVERT(varchar(5), r.TimeTo,   108)          AS TimeTo,
         ISNULL(r.Pax, 0)                              AS Pax
    FROM dbo.Tbl_TabelReservation AS r WITH (NOLOCK)
   WHERE ISNULL(r.Cancel, 0) = 0
     AND r.Txndate = @date
   ORDER BY r.TimeFrom`;

export async function readAvailability(date: string): Promise<Availability> {
  const empty: Availability = { ok: false, date, tables: [], bookings: [] };

  const sql = await loadSql();
  if (!sql) return { ...empty, reason: "driver-missing" };
  if (!isDbConfigured()) return { ...empty, reason: "not-configured" };

  try {
    const pool = await getPool();

    type TableRow = { TableNo: unknown; TableGroup: unknown; GroupName: unknown; Seats: unknown; ListingOrder: unknown };
    let tableRows: TableRow[] = [];
    let seatsKnown = true;
    try {
      tableRows = (await pool.request().query<TableRow>(tablesSql(true))).recordset ?? [];
    } catch (error) {
      // Only a missing column falls back; anything else is a real failure.
      const message = error instanceof Error ? error.message : String(error);
      if (!/Invalid column name/i.test(message)) throw error;
      seatsKnown = false;
      tableRows = (await pool.request().query<TableRow>(tablesSql(false))).recordset ?? [];
    }

    type BookingRow = { TableNo: unknown; TimeFrom: unknown; TimeTo: unknown; Pax: unknown };
    const bookingRows =
      (await pool.request().input("date", sql.VarChar(10), date).query<BookingRow>(bookingsSql)).recordset ?? [];

    const tables: AvailabilityTable[] = tableRows
      .map((row) => ({
        no: clean(row.TableNo),
        group: clean(row.TableGroup),
        groupName: clean(row.GroupName),
        seats: seatsKnown && row.Seats !== null && row.Seats !== undefined ? Number(row.Seats) || null : null,
        listingOrder: order(row.ListingOrder),
      }))
      .filter((table) => table.no);

    const bookings: AvailabilityBooking[] = bookingRows
      .map((row) => ({
        tableNo: clean(row.TableNo),
        from: clean(row.TimeFrom).slice(0, 5),
        to: clean(row.TimeTo).slice(0, 5),
        pax: Number(row.Pax) || 0,
      }))
      .filter((booking) => booking.tableNo && booking.from && booking.to);

    return { ok: true, date, tables, bookings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...empty, reason: `database: ${message}` };
  }
}
