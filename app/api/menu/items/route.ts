import { connection, NextResponse } from "next/server";
import { getMenuSnapshot } from "@/lib/menu-cache";

/**
 * GET /api/menu/items
 * Read-only menu for /menu and /order.
 *
 * The same one-minute cache the pages use, so a burst of visitors costs one
 * database read rather than one per request. `state` tells the caller what
 * happened — "ok", "unavailable" (configured but unreadable) or "unconfigured"
 * (no database at all) — because the page must never present invented dishes
 * as the restaurant's menu.
 */
export async function GET() {
  await connection();

  const snapshot = await getMenuSnapshot();
  return NextResponse.json(
    { ok: snapshot.state === "ok", state: snapshot.state, reason: snapshot.state, items: snapshot.state === "ok" ? snapshot.items : [] },
    {
      headers: {
        // A minute at the edge, and the browser may re-use it briefly.
        "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
