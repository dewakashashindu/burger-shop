import { ROOMS } from "@/app/reserve/booking-data";
import house from "./room-stock.json";

/**
 * How many of each room the house has — the sample figures, in one place.
 *
 * The counts live in `lib/room-stock.json` so that the page, the API, the
 * booking writer and `npm run rooms:check` all read the same numbers (a script
 * cannot import TypeScript, a JSON file it can).
 *
 * **Only the counts are sample data here.** Whether a room is AVAILABLE on a
 * given night is never stored in this file: it is counted, night by night, from
 * dbo.Tbl_RoomReservation — see lib/room-availability.ts.
 *
 * When the desk wants the counts in a table of their own, read the same shape
 * from it inside `roomTotals()`; nothing else in the code asks where they came
 * from.
 *
 *   garden    ×2   two Garden Rooms
 *   twin      ×2   two Twin Garden Rooms
 *   courtyard ×1   the Courtyard Suite
 *   family    ×1   the Family Residence
 */

type HouseFile = { rooms: { code: string; name: string; rooms: number }[] };

const file = house as HouseFile;

/** room code → how many the house has. */
export const ROOM_STOCK: Record<string, number> = Object.fromEntries(
  file.rooms.map((room) => [room.code, Math.max(0, Math.trunc(Number(room.rooms) || 0))]),
);

/** room code → the desk's name for it. */
export const ROOM_NAMES: Record<string, string> = Object.fromEntries(
  file.rooms.map((room) => [room.code, String(room.name || room.code)]),
);

/** The rooms this site sells, in the order the page shows them. */
export const ROOM_CODES = ROOMS.map((room) => room.id);

/** Every room code with its count — the shape availability counts from. */
export function roomTotals(): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const code of ROOM_CODES) totals[code] = Math.max(0, Math.trunc(ROOM_STOCK[code] ?? 0));
  return totals;
}

/** How many of one room the house has (0 for a code it does not sell). */
export const stockOfRoom = (code: string) => Math.max(0, Math.trunc(ROOM_STOCK[code] ?? 0));
