import { connection, NextResponse } from "next/server";
import { diagnose } from "@/lib/menu-source";
import { dbConfigSummary, isDbConfigured, loadSql, sqlDiagnostics } from "@/lib/db";

/**
 * GET /api/menu/health
 * Tells you exactly why the menu is (or is not) reading from SQL Server.
 * Open http://localhost:3000/api/menu/health in the browser.
 * The password is never included.
 */
export async function GET() {
  await connection();

  const sql = await loadSql();
  const configured = isDbConfigured();

  if (!sql || !configured) {
    return NextResponse.json({
      ok: false,
      reason: !sql ? "driver-missing" : "not-configured",
      config: dbConfigSummary(),
      diagnostics: sqlDiagnostics(),
      steps: [
        {
          step: "1. driver",
          ok: Boolean(sql),
          detail: sql ? "mssql is installed" : "mssql is missing — run: npm install mssql",
        },
        {
          step: "2. .env",
          ok: configured,
          detail: configured
            ? "DB_SERVER, DB_DATABASE and DB_USER are set"
            : "DB_SERVER / DB_DATABASE / DB_USER are empty — fill .env and restart",
        },
      ],
      menuPageShows: "built-in dishes with “Price to confirm”",
      howToFix: !sql
        ? ["npm run db:setup   (installs mssql + @types/mssql)", "stop the server, delete .next, restart"]
        : [
            "open .env (or .env.local) in the project folder",
            "fill DB_SERVER, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD",
            "save the file — Next reloads env automatically",
            "if it still fails: npm run db:check",
          ],
    });
  }

  try {
    const report = await diagnose();
    return NextResponse.json(
      {
        ok: report.items.length > 0,
        config: dbConfigSummary(),
        diagnostics: sqlDiagnostics(),
        steps: report.steps,
        variant: report.variant,
        itemCount: report.items.length,
        sample: report.items.slice(0, 3),
        menuPageShows:
          report.items.length > 0
            ? `live database rows (${report.items.length} dishes, LKR prices)`
            : "built-in dishes with “Price to confirm”",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        config: dbConfigSummary(),
        diagnostics: sqlDiagnostics(),
        steps: [{ step: "unexpected", ok: false, detail: String(error) }],
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
