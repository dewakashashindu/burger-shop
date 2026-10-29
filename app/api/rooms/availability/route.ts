import { connection, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readRoomAvailability } from "@/lib/room-availability";

/**
 * GET /api/rooms/availability?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD
 *
 * How many of each room are left on those nights, counted from the stay book.
 * Always 200: when the database cannot be read, the page keeps its own four
 * rooms instead of showing the guest nothing — the answer carries
 * `source: "fallback"` so it is never mistaken for a live count.
 */
export async function GET(request: NextRequest) {
  await connection();

  const checkin = request.nextUrl.searchParams.get("checkin") ?? "";
  const checkout = request.nextUrl.searchParams.get("checkout") ?? "";
  const month = request.nextUrl.searchParams.get("month") ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/;

  // A month, for the calendar: which nights are sold out across all four rooms.
  // Nothing is held for a month — this only greys out days before the guest
  // has said which two they want.
  if (!day.test(checkin) || !day.test(checkout)) {
    if (/^\d{4}-\d{2}$/.test(month)) {
      const first = `${month}-01`;
      const [year, monthNo] = month.split("-").map(Number);
      const next = new Date(Date.UTC(year, monthNo, 1, 12)).toISOString().slice(0, 10);
      const answer = await readRoomAvailability(first, next);
      return NextResponse.json(
        {
          ok: answer.ok,
          reason: answer.reason,
          month,
          nights: answer.nights,
          fullNights: answer.fullNights,
          source: answer.source,
        },
        {
          headers: answer.ok
            ? { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" }
            : { "cache-control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { ok: false, reason: "bad-dates", checkin, checkout, nights: [], rooms: [], fullNights: [], source: "fallback" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const availability = await readRoomAvailability(checkin, checkout);
  if (!availability.ok) {
    console.warn(`[rooms] availability unavailable for ${checkin} → ${checkout} (${availability.reason}) — the page keeps its fallback.`);
  }

  return NextResponse.json(availability, {
    headers: availability.ok
      ? // Short: a stay booked a moment ago must stop being offered.
        { "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" }
      : { "cache-control": "no-store" },
  });
}
