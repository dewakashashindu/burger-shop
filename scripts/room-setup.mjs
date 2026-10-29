#!/usr/bin/env node
/**
 * npm run db:room
 *
 * Creates the one table a room booking needs — the stay book,
 * dbo.Tbl_RoomReservation — by running scripts/room-setup.sql, then reports
 * what it found:
 *
 *   • how many stays are already in the book
 *   • the next booking number (dbo.Tbl_TxnNumbers), which is the same row the
 *     table reservations draw from
 *
 * The room counts are not in the database: they are sample figures in
 * lib/room-inventory.ts. Nothing is deleted and no counter is reset, so this
 * can be run again at any time.
 */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const requireFromProject = createRequire(pathToFileURL(join(process.cwd(), "package.json")));

function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const required = ["DB_SERVER", "DB_DATABASE", "DB_USER"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`✖ Missing ${missing.join(", ")} in .env — nothing was changed.`);
  process.exit(1);
}

let sql;
try {
  sql = requireFromProject("mssql");
} catch {
  console.error("✖ The SQL driver (mssql) is not installed. Run: npm install");
  process.exit(1);
}

const WEB_LOC_CODE = process.env.WEB_LOC_CODE?.trim() || "01";
const SEQ_TABLE = process.env.TXN_NUMBERS_TABLE?.trim() || "dbo.Tbl_TxnNumbers";
const SEQ_TYPE = process.env.STAY_SEQ_TYPE?.trim() || "RV";
const ROOM_TABLE = process.env.ROOM_TABLE?.trim() || "dbo.Tbl_RoomReservation";

const [host, inlineInstance] = (process.env.DB_SERVER || "").split(/[\\/]/);
const instance = (process.env.DB_INSTANCE || inlineInstance || "").trim();
const config = {
  server: host || process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  connectionTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 8000),
  requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT || 20000),
  options: {
    ...(instance ? { instanceName: instance } : {}),
    encrypt: ["1", "true", "yes"].includes(String(process.env.DB_ENCRYPT || "").toLowerCase()),
    trustServerCertificate: !["0", "false", "no"].includes(
      String(process.env.DB_TRUST_SERVER_CERT || "true").toLowerCase(),
    ),
  },
  pool: { max: 4, min: 0, idleTimeoutMillis: 5000 },
};

/** scripts/room-setup.sql, split into batches on the lines that say GO. */
function batches() {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "room-setup.sql");
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  return readFileSync(file, "utf8")
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter(Boolean);
}

(async () => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();

    for (const batch of batches()) await pool.request().query(batch);
    console.log(`✓ ${ROOM_TABLE} is ready`);

    // The next booking number.
    try {
      const seq = await pool
        .request()
        .input("loc", WEB_LOC_CODE)
        .input("type", SEQ_TYPE)
        .query(
          `SELECT TOP 1 LTRIM(RTRIM(Prefix)) AS Prefix, TxnNo, Enable
             FROM ${SEQ_TABLE}
            WHERE LTRIM(RTRIM(LoCCode)) = @loc AND LTRIM(RTRIM(TxnType)) = @type`,
        );
      const row = seq.recordset?.[0];
      if (!row) {
        console.warn(
          `! ${SEQ_TABLE} has no row ${WEB_LOC_CODE}/${SEQ_TYPE} — stays cannot be numbered.\n` +
            `  Room stays share the table reservations' row (RV), so if table bookings work this will too.`,
        );
      } else {
        const next = (Math.trunc(Number(row.TxnNo) || 0) + 1).toString().padStart(6, "0");
        console.log(
          `  · next booking number ${String(row.Prefix).trim()}${next}` +
            `  (TxnNo ${row.TxnNo}${row.Enable ? "" : ", DISABLED"})`,
        );
      }
    } catch (error) {
      console.warn(`! ${SEQ_TABLE} could not be read — ${error.message.split("\n")[0]}`);
    }

    const stays = await pool.request().query(
      `SELECT COUNT(*) AS stays, SUM(CASE WHEN ISNULL(Cancel, 0) = 0 THEN 1 ELSE 0 END) AS live
         FROM ${ROOM_TABLE}`,
    );
    const count = stays.recordset?.[0] ?? {};
    console.log(`  · ${Number(count.live) || 0} live room row(s) in the book, ${Number(count.stays) || 0} ever`);

    console.log("\nDone. Availability is counted from these tables; nothing is ever invented in code.");
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  } finally {
    await pool?.close().catch(() => {});
  }
})();
