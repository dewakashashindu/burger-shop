import { connection, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

const TABLE_BOOK = "dbo.Tbl_TabelReservation";
const ROOM_BOOK = "dbo.Tbl_RoomReservation";

// The requested sign-in for this first pass is client-side only. Keep
// reservation APIs available only on a developer's local/dev server until real
// server-side admin authentication is added; never expose guest PII in prod.
const devOnly = () => process.env.NODE_ENV !== "production";
type RequestLike = {
  input(name: string, value: unknown): RequestLike;
  query<T>(statement: string): Promise<{ recordset?: T[]; rowsAffected?: number[] }>;
};
type PoolLike = { request(): RequestLike };
type Row = Record<string, unknown>;
const clean = (v: unknown) => String(v ?? "").trim();
const isCancelled = (v: unknown) => v === true || v === 1 || v === "1";

export async function GET(request: Request) {
  await connection();
  if (!devOnly()) return NextResponse.json({ ok: false, message: "Production admin authentication is required." }, { status: 403, headers: { "cache-control": "no-store" } });
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "table" && kind !== "room") return NextResponse.json({ ok: false, message: "Use kind=table or kind=room." }, { status: 400 });

  try {
    const pool = await getPool() as unknown as PoolLike;
    if (kind === "table") {
      const result = await pool.request().query<Row>(
        `SELECT TOP (500)
           LTRIM(RTRIM(r.LocCode)) AS LocCode,
           LTRIM(RTRIM(r.ResID)) AS ResID,
           LTRIM(RTRIM(r.TableNo)) AS TableNo,
           CONVERT(varchar(10), r.Txndate, 23) AS Txndate,
           CONVERT(varchar(5), r.TimeFrom, 108) AS TimeFrom,
           CONVERT(varchar(5), r.TimeTo, 108) AS TimeTo,
           LTRIM(RTRIM(ISNULL(r.CusCode, ''))) AS CusCode,
           LTRIM(RTRIM(ISNULL(c.CusName, ''))) AS GuestName,
           LTRIM(RTRIM(ISNULL(c.RegTel, ''))) AS GuestPhone,
           LTRIM(RTRIM(ISNULL(r.ResRemarks, ''))) AS ResRemarks,
           ISNULL(r.Pax, 0) AS Pax,
           ISNULL(r.Cancel, 0) AS Cancel,
           LTRIM(RTRIM(ISNULL(r.CancelledRmks, ''))) AS CancelledRmks,
           LTRIM(RTRIM(ISNULL(r.CancelledUser, ''))) AS CancelledUser,
           CONVERT(varchar(19), r.CancelledDateTime, 120) AS CancelledDateTime,
           LTRIM(RTRIM(ISNULL(r.ReservedBy, ''))) AS ReservedBy,
           CONVERT(varchar(19), r.ReservedDate, 120) AS ReservedDate
         FROM ${TABLE_BOOK} AS r
         LEFT JOIN dbo.Tbl_CustomerMaster AS c
           ON c.LocCode = r.LocCode AND c.CusCode = r.CusCode
         ORDER BY r.Txndate DESC, r.TimeFrom DESC, r.ResID DESC`,
      );
      const reservations = (result.recordset ?? []).map((r) => ({
        id: clean(r.ResID), locCode: clean(r.LocCode), kind: "table" as const,
        date: clean(r.Txndate), timeFrom: clean(r.TimeFrom), timeTo: clean(r.TimeTo),
        customerCode: clean(r.CusCode), guestName: clean(r.GuestName), guestPhone: clean(r.GuestPhone),
        tableNo: clean(r.TableNo), pax: Number(r.Pax ?? 0), remarks: clean(r.ResRemarks),
        cancelled: isCancelled(r.Cancel), cancelledRemarks: clean(r.CancelledRmks),
        cancelledUser: clean(r.CancelledUser), cancelledDateTime: clean(r.CancelledDateTime),
        reservedBy: clean(r.ReservedBy), reservedDate: clean(r.ReservedDate),
      }));
      return NextResponse.json({ ok: true, kind, reservations }, { headers: { "cache-control": "no-store" } });
    }

    const result = await pool.request().query<Row>(
      `SELECT TOP (500)
         LTRIM(RTRIM(LocCode)) AS LocCode,
         LTRIM(RTRIM(ResID)) AS ResID,
         LTRIM(RTRIM(RoomCode)) AS RoomCode,
         LTRIM(RTRIM(RoomName)) AS RoomName,
         CONVERT(varchar(10), CheckIn, 23) AS CheckIn,
         CONVERT(varchar(10), CheckOut, 23) AS CheckOut,
         ISNULL(Nights, 0) AS Nights,
         ISNULL(Adults, 0) AS Adults,
         ISNULL(Children, 0) AS Children,
         ISNULL(Pax, 0) AS Pax,
         LTRIM(RTRIM(ISNULL(GuestName, ''))) AS GuestName,
         LTRIM(RTRIM(ISNULL(GuestPhone, ''))) AS GuestPhone,
         LTRIM(RTRIM(ISNULL(GuestEmail, ''))) AS GuestEmail,
         LTRIM(RTRIM(ISNULL(GuestIdNo, ''))) AS GuestIdNo,
         LTRIM(RTRIM(ISNULL(Country, ''))) AS Country,
         LTRIM(RTRIM(ISNULL(PackageCode, ''))) AS PackageCode,
         LTRIM(RTRIM(ISNULL(Currency, ''))) AS Currency,
         ISNULL(NightlyRate, 0) AS NightlyRate,
         ISNULL(TotalAmount, 0) AS TotalAmount,
         LTRIM(RTRIM(ISNULL(ArrivalTime, ''))) AS ArrivalTime,
         LTRIM(RTRIM(ISNULL(DepartureTime, ''))) AS DepartureTime,
         LTRIM(RTRIM(ISNULL(ArrivalBy, ''))) AS ArrivalBy,
         LTRIM(RTRIM(ISNULL(Requests, ''))) AS Requests,
         LTRIM(RTRIM(ISNULL(Status, ''))) AS Status,
         ISNULL(Cancel, 0) AS Cancel,
         LTRIM(RTRIM(ISNULL(CancelledRmks, ''))) AS CancelledRmks,
         LTRIM(RTRIM(ISNULL(CancelledUser, ''))) AS CancelledUser,
         CONVERT(varchar(19), CancelledDateTime, 120) AS CancelledDateTime,
         LTRIM(RTRIM(ISNULL(ReservedBy, ''))) AS ReservedBy,
         CONVERT(varchar(19), ReservedDate, 120) AS ReservedDate
       FROM ${ROOM_BOOK}
       ORDER BY CheckIn DESC, ResID DESC, RoomCode ASC`,
    );
    const reservations = (result.recordset ?? []).map((r) => ({
      id: clean(r.ResID), locCode: clean(r.LocCode), kind: "room" as const,
      roomCode: clean(r.RoomCode), roomName: clean(r.RoomName),
      checkIn: clean(r.CheckIn), checkOut: clean(r.CheckOut), nights: Number(r.Nights ?? 0),
      adults: Number(r.Adults ?? 0), children: Number(r.Children ?? 0), pax: Number(r.Pax ?? 0),
      guestName: clean(r.GuestName), guestPhone: clean(r.GuestPhone), guestEmail: clean(r.GuestEmail),
      guestIdNo: clean(r.GuestIdNo), country: clean(r.Country), packageCode: clean(r.PackageCode),
      currency: clean(r.Currency), nightlyRate: Number(r.NightlyRate ?? 0), totalAmount: Number(r.TotalAmount ?? 0),
      arrivalTime: clean(r.ArrivalTime), departureTime: clean(r.DepartureTime), arrivalBy: clean(r.ArrivalBy),
      requests: clean(r.Requests), status: clean(r.Status), cancelled: isCancelled(r.Cancel),
      cancelledRemarks: clean(r.CancelledRmks), cancelledUser: clean(r.CancelledUser),
      cancelledDateTime: clean(r.CancelledDateTime), reservedBy: clean(r.ReservedBy), reservedDate: clean(r.ReservedDate),
    }));
    return NextResponse.json({ ok: true, kind, reservations }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[admin reservations] ${kind} read failed:`, message);
    const notConfigured = /not configured|not installed/i.test(message);
    return NextResponse.json({
      ok: false,
      message: notConfigured ? "SQL Server is not configured. Fill DB_SERVER, DB_DATABASE, DB_USER and DB_PASSWORD in .env.local, then restart." : "Could not read reservations. Check the SQL connection and the supplied table schema.",
    }, { status: notConfigured ? 503 : 500, headers: { "cache-control": "no-store" } });
  }
}

export async function PATCH(request: Request) {
  await connection();
  if (!devOnly()) return NextResponse.json({ ok: false, message: "Production admin authentication is required." }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { kind?: unknown; locCode?: unknown; resId?: unknown; action?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 }); }
  const kind = clean(body.kind), locCode = clean(body.locCode), resId = clean(body.resId), action = clean(body.action);
  if ((kind !== "table" && kind !== "room") || !locCode || !resId || action !== "cancel") {
    return NextResponse.json({ ok: false, message: "A reservation type, location, reference and cancel action are required." }, { status: 400 });
  }
  try {
    const pool = await getPool() as unknown as PoolLike;
    const target = kind === "table" ? TABLE_BOOK : ROOM_BOOK;
    const result = await pool.request().input("locCode", locCode).input("resId", resId)
      .input("reason", clean(body.reason).slice(0, 500) || "Cancelled by restaurant admin")
      .query(`UPDATE ${target}
                SET Cancel = 1, CancelledRmks = @reason, CancelledUser = 'WEB', CancelledDateTime = GETDATE()
              WHERE LocCode = @locCode AND ResID = @resId AND ISNULL(Cancel, 0) = 0`);
    const affected = Number(result.rowsAffected?.[0] ?? 0);
    if (!affected) return NextResponse.json({ ok: false, message: "Reservation not found or already cancelled." }, { status: 404, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ ok: true, affected }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[admin reservations] cancel failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, message: "Could not update the reservation in SQL Server." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
