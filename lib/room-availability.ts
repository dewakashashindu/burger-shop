import { ROOMS } from "@/app/reserve/booking-data";
import { getPool, isDbConfigured, loadSql } from "./db";
import { roomTotals } from "./room-inventory";

/**
 * Which rooms are free on which nights — counted from the stay book itself.
 *
 * How many of each room the house has comes from lib/room-inventory.ts (sample
 * figures in code — the only table is the stay book itself). A room is free for
 * a night when FEWER live bookings overlap that night than the house owns:
 *
 *     Cancel = 0 AND CheckIn <= night AND CheckOut > night
 *
 * A stay of 12 → 15 November holds the nights 12, 13 and 14; the afternoon of
 * the 15th is free, because a guest leaves in the morning and the next arrives
 * in the afternoon. That is the same rule the INSERT in lib/room-reservation.ts
 * re-checks inside its transaction (UPDLOCK, HOLDLOCK), so what the guest is
 * shown here is what the booking will accept.
 *
 * If the stay book has not been created yet (npm run db:room), the page shows
 * the four rooms with their sample counts and reports `source: "fallback"` — it
 * never claims a number it has not read.
 */

export type RoomLeft = {
  code: string;
  name: string;
  category: string;
  sleeps: number | null;
  /** How many of this room the house has. */
  total: number;
  /** Free on the worst night of the stay — 0 means fully booked for these dates. */
  left: number;
  /** Held on the worst night of the stay. */
  booked: number;
};

export type RoomAvailability = {
  ok: boolean;
  reason?: string;
  checkin: string;
  checkout: string;
  nights: string[];
  rooms: RoomLeft[];
  /** Nights on which every room is taken — the calendar greys these out. */
  fullNights: string[];
  /** "database" when both tables answered, "fallback" when the house's own figures were used. */
  source: "database" | "fallback";
};

export const RESERVATION_TABLE = process.env.ROOM_TABLE?.trim() || "dbo.Tbl_RoomReservation";

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDay = (value: string) => ISO.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

/** The nights a stay holds: 12 → 15 November gives 12, 13, 14. */
export function nightsBetween(checkin: string, checkout: string): string[] {
  if (!isIsoDay(checkin) || !isIsoDay(checkout) || checkout <= checkin) return [];
  const list: string[] = [];
  const start = Date.parse(`${checkin}T12:00:00Z`);
  const end = Date.parse(`${checkout}T12:00:00Z`);
  for (let at = start; at < end; at += 86400000) list.push(new Date(at).toISOString().slice(0, 10));
  return list;
}

export function nightsCount(checkin: string, checkout: string) {
  return nightsBetween(checkin, checkout).length;
}

export type StayRow = { code: string; checkin: string; checkout: string };

/**
 * Counts, night by night, how many rooms of each kind are held — and turns that
 * into "how many are left on the worst night of the stay".
 *
 * Pure, so the allocation rules can be tested without a database.
 */
export function leftByRoom(
  rows: StayRow[],
  totals: Record<string, number>,
  checkin: string,
  checkout: string,
): { rooms: Record<string, { left: number; booked: number; total: number }>; fullNights: string[] } {
  const nights = nightsBetween(checkin, checkout);
  const rooms: Record<string, { left: number; booked: number; total: number }> = {};
  const codes = Object.keys(totals);
  const held: Record<string, Record<string, number>> = {};

  for (const code of codes) held[code] = {};
  for (const night of nights) for (const code of codes) held[code][night] = 0;

  for (const row of rows) {
    if (!(row.code in held)) continue;
    for (const night of nights) {
      if (row.checkin <= night && row.checkout > night) held[row.code][night] += 1;
    }
  }

  for (const code of codes) {
    const total = Math.max(0, Math.trunc(totals[code] ?? 0));
    let worstBooked = 0;
    for (const night of nights) worstBooked = Math.max(worstBooked, held[code][night] ?? 0);
    rooms[code] = { total, booked: worstBooked, left: Math.max(0, total - worstBooked) };
  }

  const fullNights = nights.filter((night) => codes.every((code) => (held[code][night] ?? 0) >= Math.max(0, Math.trunc(totals[code] ?? 0))));

  return { rooms, fullNights };
}

type Request = {
  input(name: string, value: unknown): Request;
  query<T>(statement: string): Promise<{ recordset?: T[] }>;
};

/** The live stays that touch these dates, from the stay book. */
export async function readOverlappingStays(
  request: { request(): Request },
  checkin: string,
  checkout: string,
): Promise<StayRow[]> {
  const found = await request
    .request()
    .input("checkin", checkin)
    .input("checkout", checkout)
    .query<{ RoomCode: unknown; CheckIn: unknown; CheckOut: unknown }>(
      `SELECT LTRIM(RTRIM(RoomCode)) AS RoomCode,
              CONVERT(char(10), CheckIn, 23)  AS CheckIn,
              CONVERT(char(10), CheckOut, 23) AS CheckOut
         FROM ${RESERVATION_TABLE} WITH (NOLOCK)
        WHERE ISNULL(Cancel, 0) = 0
          AND CheckIn  < @checkout
          AND CheckOut > @checkin`,
    );

  return (found.recordset ?? [])
    .map((row) => ({ code: clean(row.RoomCode).toLowerCase(), checkin: clean(row.CheckIn), checkout: clean(row.CheckOut) }))
    .filter((row) => row.code && isIsoDay(row.checkin) && isIsoDay(row.checkout));
}

export async function readRoomAvailability(checkin: string, checkout: string): Promise<RoomAvailability> {
  const empty: RoomAvailability = {
    ok: false,
    checkin,
    checkout,
    nights: [],
    rooms: [],
    fullNights: [],
    source: "fallback",
  };

  if (!isIsoDay(checkin) || !isIsoDay(checkout) || checkout <= checkin) {
    return { ...empty, reason: "bad-dates" };
  }

  const sql = await loadSql();
  if (!sql) return { ...empty, reason: "driver-missing" };
  if (!isDbConfigured()) return { ...empty, reason: "not-configured" };

  try {
    const pool = await getPool();
    const totals = roomTotals();

    // The stay book is the only table. If it is not there yet the counts stand
    // on their own (nothing is held), and the answer says so.
    let rows: StayRow[] = [];
    let bookMissing = false;
    try {
      rows = await readOverlappingStays(pool as unknown as { request(): Request }, checkin, checkout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Invalid object name|Cannot find the object|does not exist/i.test(message)) throw error;
      bookMissing = true;
    }

    const counted = leftByRoom(rows, totals, checkin, checkout);
    const rooms: RoomLeft[] = Object.keys(totals).map((code) => {
      const known = ROOMS.find((room) => room.id === code);
      return {
        code,
        name: known?.name ?? code,
        category: known?.cat ?? "rooms",
        sleeps: known?.sleeps ?? null,
        total: counted.rooms[code]?.total ?? 0,
        left: counted.rooms[code]?.left ?? 0,
        booked: counted.rooms[code]?.booked ?? 0,
      };
    });

    return {
      ok: true,
      checkin,
      checkout,
      nights: nightsBetween(checkin, checkout),
      rooms,
      fullNights: counted.fullNights,
      source: bookMissing ? "fallback" : "database",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...empty, reason: `database: ${message}` };
  }
}
