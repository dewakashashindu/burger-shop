#!/usr/bin/env node
/**
 * npm run otp:setup
 *
 * Creates dbo.Tbl_WebOtp — the table that holds the six-digit sign-in codes
 * (a salted sha256 of each, never the code itself). Existing rows are kept;
 * if the table is already there nothing happens.
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

const WEB_LOC_CODE = process.env.WEB_LOC_CODE?.trim() || "01";
const SEQ_TABLE = process.env.CUSTOMER_SEQ_TABLE?.trim() || "dbo.Tbl_TxnNumbers";
const SEQ_TYPE = process.env.CUSTOMER_SEQ_TYPE?.trim() || "CC";
const OTP_TABLE = process.env.OTP_TABLE?.trim() || "dbo.Tbl_WebOtp";
const CUSTOMER_TABLE = process.env.CUSTOMER_TABLE?.trim() || "dbo.Tbl_CustomerMaster";

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

const steps = [
  {
    name: OTP_TABLE,
    sql: `
      IF OBJECT_ID(N'${OTP_TABLE}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${OTP_TABLE} (
          Id         bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Tbl_WebOtp PRIMARY KEY,
          Phone      varchar(20)   NOT NULL,
          Purpose    varchar(20)   NOT NULL CONSTRAINT DF_Tbl_WebOtp_Purpose DEFAULT ('signin'),
          CodeHash   varchar(64)   NOT NULL,
          Salt       varchar(32)   NOT NULL,
          Attempts   int           NOT NULL CONSTRAINT DF_Tbl_WebOtp_Attempts DEFAULT (0),
          ExpiresAt  datetime2(0)  NOT NULL,
          CreatedAt  datetime2(0)  NOT NULL CONSTRAINT DF_Tbl_WebOtp_CreatedAt DEFAULT (GETDATE())
        );
        CREATE INDEX IX_Tbl_WebOtp_Phone ON ${OTP_TABLE} (Phone, Purpose, CreatedAt DESC);
      END;

      -- A used code is deleted, not marked: rows left by an earlier build are swept.
      IF COL_LENGTH('${OTP_TABLE}', 'ConsumedAt') IS NOT NULL
        DELETE FROM ${OTP_TABLE} WHERE ConsumedAt IS NOT NULL OR ExpiresAt < GETDATE();`,
  },
  {
    // The customer counter — reported, never changed: it belongs to the POS.
    name: `${SEQ_TABLE} — ${SEQ_TYPE}`,
    sql: `
      SELECT LTRIM(RTRIM(LoCCode)) AS LoCCode, LTRIM(RTRIM(TxnType)) AS TxnType,
             LTRIM(RTRIM(Prefix)) AS Prefix, TxnNo, Enable
        FROM ${SEQ_TABLE}
       WHERE LTRIM(RTRIM(LoCCode)) = '${WEB_LOC_CODE.replace(/'/g, "''")}'
         AND LTRIM(RTRIM(TxnType)) = '${SEQ_TYPE.replace(/'/g, "''")}'`,
    report: true,
  },
  {
    // The book's own columns — reported, so a missing one is visible up front.
    name: `${CUSTOMER_TABLE} — columns`,
    sql: `
      SELECT COUNT(*) AS columnCount
        FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${CUSTOMER_TABLE.split(".").pop()}'`,
    report: true,
  },
  {
    // How many web accounts already exist for this location.
    name: `${CUSTOMER_TABLE} — web accounts`,
    sql: `
      SELECT COUNT(*) AS webAccounts
        FROM ${CUSTOMER_TABLE}
       WHERE LTRIM(RTRIM(LoCCode)) = '${WEB_LOC_CODE.replace(/'/g, "''")}'`,
    report: true,
  },
];

(async () => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    for (const step of steps) {
      const result = await pool.request().query(step.sql);
      if (step.report) {
        const row = result.recordset?.[0];
        if (row && row.columnCount !== undefined) {
          console.log(`• ${step.name}: ${row.columnCount} columns the statements are built from`);
        } else if (row && row.webAccounts !== undefined) {
          const count = row.webAccounts;
          console.log(`• ${step.name}: ${count} account${count === 1 ? "" : "s"} at LoCCode ${WEB_LOC_CODE}`);
        } else if (row) {
          const next = (Number(row.TxnNo) || 0) + 1;
          const sample = `${row.Prefix}${String(next).padStart(6, "0")}`;
          console.log(`• ${step.name}: Prefix '${row.Prefix}', TxnNo ${row.TxnNo}, ${row.Enable ? "enabled" : "DISABLED"} — next code ${sample}`);
        } else {
          console.warn(`! ${step.name}: no row — new accounts cannot be numbered until the POS has one.`);
        }
      } else {
        console.log(`✓ ${step.name} is ready`);
      }
    }
    console.log("\nDone. Codes last five minutes, can be resent after 60 seconds, and work once.");
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  } finally {
    await pool?.close().catch(() => {});
  }
})();
