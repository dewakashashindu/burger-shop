import { connection, NextResponse } from "next/server";
import { readFloorPlan } from "@/lib/table-source";

/**
 * GET /api/tables
 *
 * The dining areas and tables the reservation form offers, straight from the
 * restaurant's POS tables. Always answers 200 so the form can fall back to its
 * built-in floor plan when the database is not reachable.
 */
export async function GET() {
  await connection();

  const { ok, reason, floor } = await readFloorPlan();
  if (!ok) {
    console.warn(`[tables] live floor plan unavailable (${reason}) — the form keeps its fallback.`);
  }

  return NextResponse.json(
    { ok, reason, ...floor, takeaway: { code: "TA", name: "Takeaway" } },
    {
      headers: ok
        ? { "cache-control": "public, max-age=0, s-maxage=120, stale-while-revalidate=600" }
        : { "cache-control": "no-store" },
    },
  );
}
