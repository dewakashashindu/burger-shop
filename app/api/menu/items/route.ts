import { connection, NextResponse } from "next/server";
import { readMenuItems } from "@/lib/menu-source";
import { isDbConfigured, loadSql } from "@/lib/db";

/**
 * GET /api/menu/items
 * Read-only menu for the /menu page.
 *
 * Always answers 200 with `ok:false` when the database cannot be read, so the
 * page quietly keeps its built-in dishes and the browser console stays clean.
 */
export async function GET() {
  await connection();

  const sql = await loadSql();
  const reason = !sql ? "driver-missing" : !isDbConfigured() ? "not-configured" : null;

  if (reason) {
    console.warn(
      `[menu] live menu unavailable (${reason}) — showing the built-in dishes. Open /api/menu/health for details.`,
    );
    return NextResponse.json(
      { ok: false, reason, items: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const items = await readMenuItems();
    return NextResponse.json(
      { ok: true, items },
      { headers: { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.error("[menu] database read failed:", error);
    return NextResponse.json(
      { ok: false, reason: "database-unavailable", items: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
