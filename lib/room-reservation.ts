import { PACKAGES, ROOMS } from "@/app/reserve/booking-data";
import { getPool, isDbConfigured, loadSql } from "./db";
import { isIsoDay, leftByRoom, nightsBetween, RESERVATION_TABLE, type StayRow } from "./room-availability";
import { roomTotals } from "./room-inventory";
import { allocateTxnNumber, TXN_LOCATION } from "./txn-number";

/**
 * The one place a stay is written: dbo.Tbl_RoomReservation — one row per room,
 * all under one booking number.
 *
 * The shape is the table flow's, because the promise to the guest is the same:
 *
 *   1. the nights are re-checked inside the transaction (UPDLOCK, HOLDLOCK) —
 *      if the last Garden Room was taken while the guest was typing, the stay
 *      is refused, not oversold;
 *   2. the booking number comes from dbo.Tbl_TxnNumbers — the same row the
 *      table reservations use (RV, prefix T, T000013-style) — in that same
 *      transaction, so two guests never share one;
 *   3. every room of the stay is inserted with the same ResID, and the counter
 *      is committed with them or rolled back with them.
 *
 * Rates are worked out here from the site's own figures (booking-data.ts) and
 * never taken from the browser — a guest cannot edit the total on the way in.
 */

export const STAY_TABLE = RESERVATION_TABLE;

export type RoomStayInput = {
  locCode: string;
  checkin: string;
  checkout: string;
  /** One entry per room, in the order the guest picked them. */
  roomCodes: string[];
  adults: number;
  children: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  guestIdNo?: string;
  country?: string;
  packageCode: string;
  currency: "LKR" | "USD";
  arrivalTime?: string;
  departureTime?: string;
  arrivalBy?: string;
  requests?: string;
  cusCode?: string;
};

export type StayRoomLine = { code: string; name: string; nightlyRate: number; total: number };

export type RoomStayResult =
  | {
      ok: true;
      reservation: {
        resId: string;
        checkin: string;
        checkout: string;
        nights: number;
        currency: "LKR" | "USD";
        total: number;
        rooms: StayRoomLine[];
      };
    }
  | { ok: false; error: { kind: "invalid" | "taken" | "not-configured" | "database"; message: string } };

const TEXT = (value: unknown, max: number) => (typeof value === "string" ? value : "").trim().slice(0, max);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE = /^(?:0\d{9}|\+?\d{9,15})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_ROOMS_PER_STAY = 8;
const MAX_NIGHTS = 30;

type Request = {
  input(name: string, value: unknown): Request;
  query<T>(statement: string): Promise<{ recordset?: T[] }>;
};
type Tx = { request(): Request };

/** The live stays that overlap these nights — locked for the rest of the transaction. */
async function lockOverlaps(tx: Tx, checkin: string, checkout: string): Promise<StayRow[]> {
  const found = await tx
    .request()
    .input("checkin", checkin)
    .input("checkout", checkout)
    .query<{ RoomCode: unknown; CheckIn: unknown; CheckOut: unknown }>(
      `SELECT LTRIM(RTRIM(RoomCode)) AS RoomCode,
              CONVERT(char(10), CheckIn, 23)  AS CheckIn,
              CONVERT(char(10), CheckOut, 23) AS CheckOut
         FROM ${RESERVATION_TABLE} WITH (UPDLOCK, HOLDLOCK)
        WHERE ISNULL(Cancel, 0) = 0
          AND CheckIn  < @checkout
          AND CheckOut > @checkin`,
    );

  return (found.recordset ?? [])
    .map((row) => ({
      code: String(row.RoomCode ?? "").trim().toLowerCase(),
      checkin: String(row.CheckIn ?? "").trim(),
      checkout: String(row.CheckOut ?? "").trim(),
    }))
    .filter((row) => row.code && isIsoDay(row.checkin) && isIsoDay(row.checkout));
}

/** Sri Lanka's day (UTC+5:30), so "today" is the restaurant's, not the server's. */
function sriLankaToday() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export async function createRoomReservation(input: RoomStayInput): Promise<RoomStayResult> {
  const checkin = TEXT(input.checkin, 10);
  const checkout = TEXT(input.checkout, 10);
  const nights = nightsBetween(checkin, checkout);
  if (!isIsoDay(checkin)) return { ok: false, error: { kind: "invalid", message: "Choose a check-in date." } };
  if (!isIsoDay(checkout)) return { ok: false, error: { kind: "invalid", message: "Choose a check-out date." } };
  if (!nights.length) return { ok: false, error: { kind: "invalid", message: "Check-out must be after check-in." } };
  if (nights.length > MAX_NIGHTS)
    return { ok: false, error: { kind: "invalid", message: `A single stay can be up to ${MAX_NIGHTS} nights.` } };
  if (checkin < sriLankaToday())
    return { ok: false, error: { kind: "invalid", message: "That check-in date has already passed." } };

  const codes = (Array.isArray(input.roomCodes) ? input.roomCodes : [])
    .map((code) => TEXT(code, 20).toLowerCase())
    .filter(Boolean);
  if (!codes.length) return { ok: false, error: { kind: "invalid", message: "Choose at least one room." } };
  if (codes.length > MAX_ROOMS_PER_STAY)
    return { ok: false, error: { kind: "invalid", message: "That is more rooms than one stay can hold." } };

  const unknown = codes.find((code) => !ROOMS.some((room) => room.id === code));
  if (unknown) return { ok: false, error: { kind: "invalid", message: "One of those rooms is not sold here." } };

  const currency: "LKR" | "USD" = input.currency === "USD" ? "USD" : "LKR";
  const pkg = PACKAGES.find((item) => item.id === input.packageCode) ?? null;
  if (!pkg) return { ok: false, error: { kind: "invalid", message: "Choose a board basis." } };

  const adults = Math.max(1, Math.min(20, Math.trunc(Number(input.adults) || 0)));
  const children = Math.max(0, Math.min(20, Math.trunc(Number(input.children) || 0)));
  const guestName = TEXT(input.guestName, 120);
  const guestPhone = TEXT(input.guestPhone, 20).replace(/[\s-]/g, "");
  const guestEmail = TEXT(input.guestEmail, 120);
  const guestIdNo = TEXT(input.guestIdNo, 30);
  const country = TEXT(input.country, 60);
  const arrivalTime = TEXT(input.arrivalTime, 5);
  const departureTime = TEXT(input.departureTime, 5);
  const arrivalBy = TEXT(input.arrivalBy, 40);

  if (guestName.length < 2) return { ok: false, error: { kind: "invalid", message: "Enter the guest name." } };
  if (!PHONE.test(guestPhone)) return { ok: false, error: { kind: "invalid", message: "Enter a valid phone number." } };
  if (guestEmail && !EMAIL.test(guestEmail))
    return { ok: false, error: { kind: "invalid", message: "Enter a valid email address." } };
  if (arrivalTime && !HHMM.test(arrivalTime))
    return { ok: false, error: { kind: "invalid", message: "Choose an arrival time." } };
  if (departureTime && !HHMM.test(departureTime))
    return { ok: false, error: { kind: "invalid", message: "Choose a departure time." } };

  // The web location, unless the caller named another (the desk's own LoCCode).
  const locCode = TEXT(input.locCode, 10) || TXN_LOCATION;

  const sql = await loadSql();
  if (!sql) return { ok: false, error: { kind: "not-configured", message: "The reservation system is not connected." } };
  if (!isDbConfigured())
    return { ok: false, error: { kind: "not-configured", message: "The reservation system is not connected." } };

  // One line per room, at the rate this site quotes for the stay.
  const pkgRate = currency === "LKR" ? pkg.local : pkg.foreign;
  const lines: StayRoomLine[] = codes.map((code) => {
    const room = ROOMS.find((item) => item.id === code)!;
    const nightlyRate = (currency === "LKR" ? room.local : room.foreign) + pkgRate;
    return { code, name: room.name, nightlyRate, total: nightlyRate * nights.length };
  });
  const total = lines.reduce((sum, line) => sum + line.total, 0);

  const pool = (await getPool()) as unknown as {
    transaction(): Tx & { begin(): Promise<unknown>; commit(): Promise<unknown>; rollback(): Promise<unknown> };
    request(): Request;
  };

  const tx = pool.transaction();
  try {
    await tx.begin();

    // 1. How many the house has (lib/room-inventory.ts) and the stays already on
    //    these nights, locked so a second guest waits here.
    const totals = roomTotals();
    const overlaps = await lockOverlaps(tx, checkin, checkout);
    const counted = leftByRoom(overlaps, totals, checkin, checkout);

    const demand: Record<string, number> = {};
    for (const code of codes) demand[code] = (demand[code] ?? 0) + 1;

    for (const [code, wanted] of Object.entries(demand)) {
      const left = counted.rooms[code]?.left ?? 0;
      if (wanted > left) {
        await tx.rollback();
        const name = ROOMS.find((room) => room.id === code)?.name ?? "That room";
        return {
          ok: false,
          error: {
            kind: "taken",
            message:
              left <= 0
                ? `${name} is already taken for those nights. Choose other dates or another room.`
                : `Only ${left} ${name}${left === 1 ? "" : "s"} is free on those nights — you asked for ${wanted}.`,
          },
        };
      }
    }

    // 2. The booking number — the same dbo.Tbl_TxnNumbers row the table
    //    reservations draw from (RV / prefix T).
    const number = await allocateTxnNumber(tx as unknown as Parameters<typeof allocateTxnNumber>[0], "stay", {
      locCode,
    });
    if (!number.ok) {
      await tx.rollback();
      return { ok: false, error: { kind: "not-configured", message: number.error.message } };
    }
    const resId = number.number.slice(0, 10);

    // 3. One row per room, all under that number.
    for (const line of lines) {
      await tx
        .request()
        .input("resId", resId)
        .input("roomCode", line.code)
        .input("roomName", line.name)
        .input("locCode", locCode)
        .input("checkin", checkin)
        .input("checkout", checkout)
        .input("nights", nights.length)
        .input("adults", adults)
        .input("children", children)
        .input("pax", adults + children)
        .input("guestName", guestName)
        .input("guestPhone", guestPhone)
        .input("guestEmail", guestEmail)
        .input("guestIdNo", guestIdNo)
        .input("country", country)
        .input("packageCode", pkg.id)
        .input("currency", currency)
        .input("nightlyRate", line.nightlyRate)
        .input("totalAmount", line.total)
        .input("arrivalTime", arrivalTime)
        .input("departureTime", departureTime)
        .input("arrivalBy", arrivalBy)
        .input("requests", TEXT(input.requests, 800))
        .input("cusCode", TEXT(input.cusCode, 10))
        .query(
          `INSERT INTO ${RESERVATION_TABLE}
             (ResID, RoomCode, RoomName, LocCode, CheckIn, CheckOut, Nights, Adults, Children, Pax,
              GuestName, GuestPhone, GuestEmail, GuestIdNo, Country, PackageCode, Currency,
              NightlyRate, TotalAmount, ArrivalTime, DepartureTime, ArrivalBy, Requests, CusCode,
              ReservedBy, ReservedDate, Status, Cancel)
           VALUES
             (@resId, @roomCode, @roomName, @locCode, @checkin, @checkout, @nights, @adults, @children, @pax,
              @guestName, @guestPhone, @guestEmail, @guestIdNo, @country, @packageCode, @currency,
              @nightlyRate, @totalAmount, @arrivalTime, @departureTime, @arrivalBy, @requests, @cusCode,
              'WEB', GETDATE(), 'BOOKED', 0)`,
        );
    }

    await tx.commit();

    return {
      ok: true,
      reservation: {
        resId,
        checkin,
        checkout,
        nights: nights.length,
        currency,
        total,
        rooms: lines,
      },
    };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      /* already rolled back (a refused stay) */
    }
    const message = error instanceof Error ? error.message : String(error);

    // The tables are missing: say so once, plainly, and point at the setup.
    if (/Invalid object name/i.test(message)) {
      return {
        ok: false,
        error: {
          kind: "not-configured",
          message: `The stay book is not created yet (${RESERVATION_TABLE}). Run npm run db:room.`,
        },
      };
    }
    return { ok: false, error: { kind: "database", message } };
  }
}
