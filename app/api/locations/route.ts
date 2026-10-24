import { connection, NextResponse } from "next/server";
import { getPool, isDbConfigured, loadSql } from "@/lib/db";

/**
 * GET /api/locations
 * The restaurant locations a guest can pick up from (read-only).
 *
 * Tbl_LocationMaster holds every location; SubLoc <> 0 are sub-locations, so
 * only the main ones are offered. Always answers 200 with `ok:false` when the
 * database cannot be read, so the page can keep a neutral fallback.
 */
type LocationRow = { LocCode: string | null; LocDes: string | null };

const CLEAN = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function GET() {
  await connection();

  const sql = await loadSql();
  const reason = !sql ? "driver-missing" : !isDbConfigured() ? "not-configured" : null;

  if (reason) {
    console.warn(
      `[locations] live locations unavailable (${reason}) — the page keeps its fallback. Open /api/menu/health for details.`,
    );
    return NextResponse.json(
      { ok: false, reason, locations: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const pool = await getPool();
    // Enable is optional in some databases — fall back to the plain query.
    const queries = [
      `SELECT LocCode, LocDes
         FROM dbo.Tbl_LocationMaster WITH (NOLOCK)
        WHERE ISNULL(SubLoc, 0) = 0 AND ISNULL(Enable, 1) = 1
        ORDER BY LocCode`,
      `SELECT LocCode, LocDes
         FROM dbo.Tbl_LocationMaster WITH (NOLOCK)
        WHERE ISNULL(SubLoc, 0) = 0
        ORDER BY LocCode`,
    ];

    let rows: LocationRow[] = [];
    for (const statement of queries) {
      try {
        const result = await pool.request().query<LocationRow>(statement);
        rows = result.recordset ?? [];
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/Invalid column name|Invalid object name/i.test(message)) throw error;
      }
    }

    const locations = rows
      .map((row) => ({ code: CLEAN(row.LocCode), name: CLEAN(row.LocDes) }))
      .filter((row) => row.code && row.name);

    return NextResponse.json(
      { ok: true, locations },
      { headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("[locations] database read failed:", error);
    return NextResponse.json(
      { ok: false, reason: "database-unavailable", locations: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
