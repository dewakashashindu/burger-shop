#!/usr/bin/env node
/**
 * npm run db:check
 *
 * Prints, step by step, whether the menu can read from SQL Server:
 *   .env  →  driver  →  TCP/login  →  query  →  first rows
 * It never writes to the database and never prints the password.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const envFiles = [".env.local", ".env"].map((file) => resolve(cwd, file)).filter(existsSync);

for (const file of envFiles) {
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const ok = (label, detail) => console.log(`  \x1b[32m✔\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
const bad = (label, detail) => console.log(`  \x1b[31m✘\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
const warn = (label, detail) => console.log(`  \x1b[33m•\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
const head = (text) => console.log(`\n\x1b[1m${text}\x1b[0m`);

const read = (key) => (process.env[key] ?? "").trim();
const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const bool = (value, fallback) => {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

console.log("\x1b[1mMicroEChef — SQL Server menu check\x1b[0m");

head("1. Files");
console.log(`  project: ${cwd}`);
if (envFiles.length === 0) bad(".env", "no .env or .env.local found in this folder");
else envFiles.forEach((file) => ok(".env", file.replace(cwd + "\\", "").replace(cwd + "/", "")));

head("2. Settings");
const server = read("DB_SERVER");
const [host, inlineInstance] = server.split(/[\\/]/);
const instance = read("DB_INSTANCE") || inlineInstance || "";
const settings = {
  server: host || server,
  instance: instance || null,
  port: num(read("DB_PORT"), 1433),
  database: read("DB_DATABASE"),
  user: read("DB_USER"),
  passwordSet: Boolean(read("DB_PASSWORD")),
  encrypt: bool(read("DB_ENCRYPT"), false),
  trustServerCertificate: bool(read("DB_TRUST_SERVER_CERT"), true),
};
for (const [key, value] of Object.entries(settings)) {
  if (key === "passwordSet") {
    (value ? ok : bad)(`password set`, value ? "yes (hidden)" : "DB_PASSWORD is empty");
  } else if (key === "instance") {
    if (value) ok("instance", value);
    else warn("instance", "none (default instance)");
  } else if (["server", "database", "user"].includes(key)) {
    (value ? ok : bad)(key, String(value || "(empty)"));
  } else {
    ok(key, String(value));
  }
}
if (!settings.server || !settings.database || !settings.user) {
  console.log("\n\x1b[31mFill DB_SERVER, DB_DATABASE and DB_USER in .env, then run this again.\x1b[0m\n");
  process.exit(1);
}

head("3. Driver");
let sql;
try {
  sql = (await import("mssql")).default ?? (await import("mssql"));
  ok("mssql", "installed");
} catch {
  bad("mssql", "not installed — run: npm run db:setup");
  console.log("\n\x1b[33mThe menu page keeps the built-in dishes until mssql is installed.\x1b[0m\n");
  process.exit(1);
}

head("4. Connect");
const config = {
  server: settings.server,
  port: settings.port,
  database: settings.database,
  user: settings.user,
  password: read("DB_PASSWORD"),
  connectionTimeout: num(read("DB_CONNECT_TIMEOUT"), 8000),
  requestTimeout: num(read("DB_REQUEST_TIMEOUT"), 12000),
  options: {
    ...(settings.instance ? { instanceName: settings.instance } : {}),
    encrypt: settings.encrypt,
    trustServerCertificate: settings.trustServerCertificate,
  },
};

let pool;
try {
  pool = await new sql.ConnectionPool(config).connect();
  ok("login", `${settings.server}${settings.instance ? "\\" + settings.instance : ""}:${settings.port} / ${settings.database}`);
} catch (error) {
  bad("login", `${error.code ? error.code + " · " : ""}${error.message}`);
  const signature = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/ESOCKET|ETIMEOUT|ECONNREFUSED|Failed to connect/i.test(signature)) {
    console.log("     → server name / port / firewall / SQL Server not running / TCP/IP disabled in SQL Server Configuration Manager");
  }
  if (/ELOGIN|Login failed/i.test(signature)) {
    console.log("     → wrong user name or password (DB_USER / DB_PASSWORD)");
  }
  if (/database .* does not exist|Cannot open database/i.test(signature)) {
    console.log("     → DB_DATABASE name is wrong");
  }
  console.log();
  process.exit(1);
}

const selectList = `
      a.MenuItemCode,
      a.MenuItmDes,
      a.SalesPrice,
      a.Category,
      a.Level1,
      a.L1Des,
      a.Level2,
      a.L2Des,
      a.L1LitingOrder,
      a.LISTINGORDER,
      m.DisplayItemDes,
      CASE WHEN m.ItemPicMob IS NULL THEN 0 ELSE 1 END AS HasPicture`;
const fromJoin = `
  FROM dbo.Vw_MenuAssignment AS a WITH (NOLOCK)
  INNER JOIN dbo.Tbl_MenuItems AS m WITH (NOLOCK)
    ON m.MenuItmId = a.MenuItemCode`;
const orderBy = `
  ORDER BY ISNULL(a.Category, ''), ISNULL(a.L1LitingOrder, 0), ISNULL(a.LISTINGORDER, 0), a.MenuItmDes`;
const where = `WHERE a.DisplayInFront = '1' AND a.MenuAssiEnable = '1' AND a.MenuItemEnable = '1'`;

const variants = [
  { label: "ItemNotAvailable on the view", text: `SELECT ${selectList}${fromJoin}\n  ${where} AND ISNULL(a.ItemNotAvailable,0) = 0${orderBy}` },
  { label: "ItemNotAvailable on the item table", text: `SELECT ${selectList}${fromJoin}\n  ${where} AND ISNULL(m.ItemNotAvailable,0) = 0${orderBy}` },
  { label: "no ItemNotAvailable filter", text: `SELECT ${selectList}${fromJoin}\n  ${where}${orderBy}` },
];

head("5. Menu query");
let rows = null;
for (const variant of variants) {
  try {
    const result = await pool.request().query(variant.text);
    rows = result.recordset ?? [];
    ok(`query`, `${variant.label} → ${rows.length} rows`);
    break;
  } catch (error) {
    bad(`query`, `${variant.label} → ${error.message.split("\n")[0]}`);
  }
}

if (!rows) {
  console.log("\n\x1b[31mNone of the query shapes matched your schema. The exact column names above need checking.\x1b[0m\n");
  await pool.close();
  process.exit(1);
}

head("6. First rows");
if (rows.length === 0) {
  bad("no rows", "the tables exist but the filters return nothing — check DisplayInFront / MenuAssiEnable / MenuItemEnable and ItemNotAvailable");
} else {
  for (const row of rows.slice(0, 5)) {
    console.log(
      `  ${String(row.MenuItemCode).padEnd(10)} ${String(row.MenuItmDes).padEnd(24)} ` +
        `LKR ${String(row.SalesPrice).padEnd(8)} cat=${row.Category ?? "-"} group=${row.L1Des ?? "-"} sub=${row.L2Des ?? "-"} pic=${row.HasPicture ? "yes" : "no"}`,
    );
  }
  ok("done", `${rows.length} dishes will appear on /menu with these prices`);
}

head("7. Reservation numbers");
// Read-only: nothing here touches TxnNo. The booking flow is the only writer.
const loc = (read("WEB_LOC_CODE") || "01").trim();
const wanted = [
  { type: (read("TABLE_SEQ_TYPE") || "RV").trim(), label: "table booking" },
  { type: (read("STAY_SEQ_TYPE") || "RV").trim(), label: "room booking" },
  { type: "CC", label: "customer code" },
];
const seen = new Set();
for (const want of wanted) {
  const key = `${loc}/${want.type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  try {
    const found = await pool
      .request()
      .input("loc", loc)
      .input("type", want.type)
      .query(
        `SELECT TOP 1 LTRIM(RTRIM(Prefix)) AS Prefix, TxnNo, TxnDescription, Enable
           FROM dbo.Tbl_TxnNumbers WITH (NOLOCK)
          WHERE LTRIM(RTRIM(LoCCode)) = @loc AND LTRIM(RTRIM(TxnType)) = @type`,
      );
    const row = found.recordset?.[0];
    if (!row) {
      bad(`${want.label} (${key})`, "no row in dbo.Tbl_TxnNumbers — a booking will be refused, not invented");
      continue;
    }
    const counter = Math.trunc(Number(row.TxnNo ?? 0)) + 1;
    const next = `${String(row.Prefix ?? "").trim()}${String(counter).padStart(6, "0")}`;
    if (row.Enable === true || row.Enable === 1) {
      ok(`${want.label} (${key})`, `TxnNo ${row.TxnNo} → next ${next} · ${String(row.TxnDescription ?? "").trim()}`);
    } else {
      bad(`${want.label} (${key})`, `Enable is off — ${String(row.TxnDescription ?? "").trim()} cannot take numbers`);
    }
  } catch (error) {
    warn(`${want.label} (${key})`, `dbo.Tbl_TxnNumbers could not be read — ${error.message.split("\n")[0]}`);
  }
}

head("8. Rooms");
// Read-only: the stay book is written only by /api/rooms/confirm.
const roomTable = (read("ROOM_TABLE") || "dbo.Tbl_RoomReservation").trim();
warn("room counts", "sample figures in lib/room-inventory.ts — not a table");
try {
  const found = await pool.request().query(
    `SELECT COUNT(*) AS rows_all,
            SUM(CASE WHEN ISNULL(Cancel, 0) = 0 AND CheckOut >= CAST(GETDATE() AS date) THEN 1 ELSE 0 END) AS live
       FROM ${roomTable} WITH (NOLOCK)`,
  );
  const row = found.recordset?.[0] ?? {};
  ok(roomTable, `${Number(row.live) || 0} live row(s), ${Number(row.rows_all) || 0} ever`);
} catch (error) {
  bad(roomTable, `${error.message.split("\n")[0]} — run npm run db:room`);
}

await pool.close();
console.log("\n\x1b[32mAll good.\x1b[0m Restart the dev server and open http://localhost:3000/menu\n");
