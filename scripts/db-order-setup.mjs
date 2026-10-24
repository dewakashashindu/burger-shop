#!/usr/bin/env node
/**
 * npm run db:order
 *
 * Creates dbo.Tbl_holdUpsCloudTempWeb (if it is missing) and makes sure the
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
IF OBJECT_ID('dbo.Tbl_holdUpsCloudTempWeb', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Tbl_holdUpsCloudTempWeb
  (
      LocCode        char(10)      NOT NULL,
      TabelNo        char(10)      NOT NULL,
      OrderNo        char(10)      NOT NULL,
      UserID         char(10)      NOT NULL,
      UserName       varchar(50)   NOT NULL,
      AOR            char(1)       NOT NULL,
      ItemCode       char(10)      NOT NULL,
      QTY            float         NOT NULL,
      ItemRemarks    varchar(500)  NULL,
      TabelGrpID     char(10)      NULL,
      TxnDateTime    datetime      NOT NULL,
      LPax           float         NOT NULL,
      FPax           float         NOT NULL,
      MgrID          char(10)      NULL,
      OrderType      varchar(5)    NOT NULL,
      SalesPrice     float         NOT NULL,
      VoidRemark     varchar(200)  NULL,
      InvoiceNo      varchar(50)   NOT NULL,
      IsPaid         bit           NOT NULL DEFAULT 0,
      CusName        varchar(200)  NULL,
      CusCode        char(10)      NULL,
      RowLine        float         NOT NULL,
      RowId          bigint IDENTITY(1,1) NOT NULL,
      ScheduleDate   date          NOT NULL,
      ScheduleTime   time(0)       NOT NULL,
      ScheduleDateTime AS (CAST(ScheduleDate AS datetime) + CAST(ScheduleTime AS datetime)) PERSISTED,
      CusPhone       varchar(20)   NOT NULL,
      CusAddress     varchar(300)  NULL,
      CusLoc         varchar(100)  NULL,
      DeliveryFee    float         NOT NULL DEFAULT 0,
      OrderNote      varchar(500)  NULL,
      CONSTRAINT PK_HoldUpsCloudTempWeb PRIMARY KEY CLUSTERED (RowId)
  )
END`;

const CREATE_INDEXES = [
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HoldUpsCloudTempWeb_Order')
     CREATE INDEX IX_HoldUpsCloudTempWeb_Order
       ON dbo.Tbl_holdUpsCloudTempWeb (InvoiceNo, TabelNo, RowLine)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HoldUpsCloudTempWeb_Schedule')
     CREATE INDEX IX_HoldUpsCloudTempWeb_Schedule
       ON dbo.Tbl_holdUpsCloudTempWeb (ScheduleDate, ScheduleTime, IsPaid)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HoldUpsCloudTempWeb_Bill')
     CREATE INDEX IX_HoldUpsCloudTempWeb_Bill
       ON dbo.Tbl_holdUpsCloudTempWeb (InvoiceNo, IsPaid)`,
];

async function ensureSerial(pool, code, start, note = "") {
  const found = await pool.request().input("code", code).query(
    "SELECT SeriNo FROM dbo.Tbl_Serials WHERE SeriCode = @code",
  );
  if (found.recordset?.length) {
    console.log(`  = ${code.padEnd(4)} already there (SeriNo = ${found.recordset[0].SeriNo})`);
    return;
  }
  await pool.request().input("code", code).input("start", start).query(
    "INSERT INTO dbo.Tbl_Serials (SeriCode, SeriNo) VALUES (@code, @start)",
  );
  console.log(`  + ${code.padEnd(4)} created (SeriNo = ${start})${note ? `  ⚠ ${note}` : ""}`);
}

const pool = await new sql.ConnectionPool(config).connect();
try {
  console.log(`› Database: ${config.database} on ${config.server}:${config.port}`);

  await pool.request().query(CREATE_TABLE);
  const existed = await pool
    .request()
    .query("SELECT COUNT(*) AS n FROM dbo.Tbl_holdUpsCloudTempWeb");
  console.log(`  ✓ dbo.Tbl_holdUpsCloudTempWeb ready (${existed.recordset[0].n} existing row(s))`);

  for (const statement of CREATE_INDEXES) await pool.request().query(statement);
  console.log("  ✓ indexes checked");

  console.log("› Counters in dbo.Tbl_Serials");
  await ensureSerial(pool, "INV", 0, "the website would number invoices from 1 — tell us if the POS expects something else");
  await ensureSerial(pool, "ODN", 0);
  await ensureSerial(pool, "DL", 0);
  await ensureSerial(pool, "PU", 0);

  const columns = await pool.request().query(
    "SELECT COUNT(*) AS n FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Tbl_holdUpsCloudTempWeb')",
  );
  console.log(`\n✔ Done — the web order table has ${columns.recordset[0].n} columns.`);
  console.log("  Try an order in the site; it should now save and show DL-0001 / PU-0001.");
} catch (error) {
  console.error("\n✖ " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await pool.close();
}
