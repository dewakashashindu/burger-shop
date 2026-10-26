import { connection, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readAvailability } from "@/lib/table-availability";

/**
 * GET /api/tables/availability?date=YYYY-MM-DD
 *
 * The tables and that day's bookings, read from the reservation book. The page
 * works out which tables are free for its window, and the nearest times that
 * still have room, from this one answer.
 *
 * Always 200: when the database cannot be read the page keeps its own area /
 * table dropdowns instead of showing the guest nothing.
 */
export async function GET(request: NextRequest) {
  await connection();

  const raw = request.nextUrl.searchParams.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  if (!date) {
    return NextResponse.json(
      { ok: false, reason: "bad-date", tables: [], bookings: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const availability = await readAvailability(date);
  if (!availability.ok) {
    console.warn(`[tables] availability unavailable for ${date} (${availability.reason}) — the form keeps its fallback.`);
  }

  return NextResponse.json(availability, {
    headers: availability.ok
      ? // Short: a booking taken a second ago must disappear from the list.
        { "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" }
      : { "cache-control": "no-store" },
  });
}
