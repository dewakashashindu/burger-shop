#!/usr/bin/env node
/**
 * npm run db:order
 *
 * Creates dbo.Tbl_holdUpsCloudTempOO (if it is missing) and makes sure the
 * three counters the website needs exist in dbo.Tbl_Serials:
 *
 *   INV - invoice number       INV-20261024-001 style (existing counter)
 *   ODN - order number         OrderNo
 *   DL  - delivery number      TabelNo  -> DL-0001
 *   PU  - pickup number        TabelNo  -> PU-0001
 *
 * Nothing is deleted and no existing counter is reset: a counter is only
 * created when its row is missing.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

const CREATE_TABLE = `
IF OBJECT_ID('dbo.Tbl_holdUpsCloudTempOO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Tbl_holdUpsCloudTempOO
  (
      LocCode           char(10)      NOT NULL,
      TabelNo           char(10)      NOT NULL,
      OrderNo           char(10)      NOT NULL,
      UserID            char(10)      NOT NULL,
      UserName          varchar(50)   NOT NULL,
      AOR               char(1)       NOT NULL,
      ItemCode          char(10)      NOT NULL,
      QTY               float         NOT NULL,
      ItemRemarks       varchar(500)  NULL,
      TabelGrpID        char(10)      NULL,
      TxnDateTime       datetime      NOT NULL,
      LPax              float         NOT NULL,
      FPax              float         NOT NULL,
      MgrID             char(10)      NULL,
      OrderType         varchar(5)    NOT NULL,
      SalesPrice        float         NOT NULL,
      VoidRemark        varchar(200)  NULL,
      InvoiceNo         varchar(50)   NOT NULL,
      IsPaid            bit           NOT NULL DEFAULT 0,
      CusName           varchar(200)  NULL,
      CusCode           char(10)      NULL,
      RowLine           float         NOT NULL,
      ScheduleDate      date          NOT NULL,
      ScheduleTime      time(7)       NOT NULL,
      ScheduleDateTime  datetime      NULL,
      CusPhone          varchar(20)   NOT NULL,
      CusAddress        varchar(300)  NULL,
      CusLoc            varchar(100)  NULL,
      DeliveryFee       float         NOT NULL DEFAULT 0,
      OrderNote         varchar(500)  NULL,
      CONSTRAINT PK_HoldUpsCloudTempOO PRIMARY KEY CLUSTERED (RowLine)
  )
END`;

const CREATE_INDEXES = [
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HoldUpsCloudTempOO_Order')
     CREATE INDEX IX_HoldUpsCloudTempOO_Order
       ON dbo.Tbl_holdUpsCloudTempOO (InvoiceNo, TabelNo, RowLine)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HoldUpsCloudTempOO_Schedule')
     CREATE INDEX IX_HoldUpsCloudTempOO_Schedule
       ON dbo.Tbl_holdUpsCloudTempOO (ScheduleDate, ScheduleTime, IsPaid)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HoldUpsCloudTempOO_Bill')
     CREATE INDEX IX_HoldUpsCloudTempOO_Bill
       ON dbo.Tbl_holdUpsCloudTempOO (InvoiceNo, IsPaid)`,
];

// dbo.Tbl_Serials is the same table the POS / QR orders use. Its optional
// columns (SeriDate, LocCode) must be filled in when a counter is created,
// otherwise a NOT NULL column would reject the INSERT.
async function serialsColumns(pool) {
  const found = await pool.request().query(
    "SELECT c.name, c.is_nullable FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.Tbl_Serials')",
  );
  return (found.recordset || []).map((row) => ({
    name: String(row.name),
    lower: String(row.name).toLowerCase(),
    nullable: Boolean(row.is_nullable),
  }));
}

function sriLankaToday() {
  const t = new Date(Date.now() + 330 * 60 * 1000);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return { iso: `${y}-${m}-${d}`, compact: `${y}${m}${d}` };
}

async function ensureSerial(pool, columns, code, start, note = "") {
  const has = (name) => columns.some((column) => column.lower === name);
  const found = await pool.request().input("code", code).query(
    "SELECT SeriNo FROM dbo.Tbl_Serials WHERE SeriCode = @code",
  );
  if ((found.recordset || []).length) {
    console.log(`  = ${code.padEnd(4)} already there (SeriNo = ${found.recordset[0].SeriNo}) — left alone`);
    return;
  }

  const names = ["SeriCode", "SeriNo"];
  const values = ["@code", "@start"];
  if (has("seridate")) {
    names.push("SeriDate");
    values.push("@today");
  }
  if (has("loccode")) {
    names.push("LocCode");
    values.push("@loc");
  }

  const request = pool.request().input("code", code).input("start", start).input("today", sriLankaToday().iso).input("loc", "");
  await request.query(`INSERT INTO dbo.Tbl_Serials (${names.join(", ")}) VALUES (${values.join(", ")})`);
  console.log(`  + ${code.padEnd(4)} created (SeriNo = ${start})${note ? `  ⚠ ${note}` : ""}`);
}

const pool = await new sql.ConnectionPool(config).connect();
try {
  console.log(`› Database: ${config.database} on ${config.server}:${config.port}`);

  await pool.request().query(CREATE_TABLE);
  const existed = await pool
    .request()
    .query("SELECT COUNT(*) AS n FROM dbo.Tbl_holdUpsCloudTempOO");
  console.log(`  ✓ dbo.Tbl_holdUpsCloudTempOO ready (${existed.recordset[0].n} existing row(s))`);

  for (const statement of CREATE_INDEXES) await pool.request().query(statement);
  console.log("  ✓ indexes checked");

  console.log("› Counters in dbo.Tbl_Serials");
  const serialColumns = await serialsColumns(pool);
  const hasSeriDate = serialColumns.some((column) => column.lower === "seridate");
  console.log(
    `  · columns: ${serialColumns.map((column) => column.name).join(", ")}${hasSeriDate ? "  (daily invoice reset ON)" : "  (no SeriDate — invoices count on)"}`,
  );

  await ensureSerial(pool, serialColumns, "INV", 0, "the website would number invoices from 1 — tell us if the POS expects something else");
  await ensureSerial(pool, serialColumns, "ODN", 0);
  await ensureSerial(pool, serialColumns, "DL", 0);
  await ensureSerial(pool, serialColumns, "PU", 0);

  const today = sriLankaToday();
  const live = await pool.request().input("code", "INV").query(
    "SELECT SeriNo FROM dbo.Tbl_Serials WHERE SeriCode = @code",
  );
  if ((live.recordset || []).length) {
    console.log(`\n  Next invoice from the website: INV-${today.compact}-${String(Number(String(live.recordset[0].SeriNo).replace(/\D/g, "") || 0) + 1).padStart(3, "0")}`);
    console.log("  (or -001 again if SeriDate says the counter belongs to an earlier day)");
  }

  const columns = await pool.request().query(
    "SELECT COUNT(*) AS n FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Tbl_holdUpsCloudTempOO')",
  );
  console.log(`\n✔ Done — the web order table has ${columns.recordset[0].n} columns.`);
  console.log("  Try an order in the site; it should now save and show DL-0001 / PU-0001.");
} catch (error) {
  console.error("\n✖ " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await pool.close();
}
