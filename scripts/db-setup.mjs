#!/usr/bin/env node
/**
 * npm run db:setup
 *
 * Installs the SQL Server driver into THIS project folder and then checks the
 * connection. Run it once after copying the files, and again if `mssql` ever
 * disappears (for example after deleting node_modules).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;

console.log("\n" + bold("MicroEChef — database setup"));

if (!existsSync(join(cwd, "package.json"))) {
  console.log(red(`No package.json in ${cwd}. Run this from the project folder (E:\\burger\\burger-shop).\n`));
  process.exit(1);
}

const hasDriver = existsSync(join(cwd, "node_modules", "mssql", "package.json"));
console.log(hasDriver ? green("✔ mssql is already installed") : yellow("• mssql is not installed — installing now"));

const run = (args, label) => {
  console.log(bold(`\n$ npm ${args.join(" ")}`));
  const result = spawnSync(npm, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.log(red(`\n✘ ${label} failed (exit ${result.status}).`));
    console.log(yellow("If this is a proxy/offline problem, install it manually: npm install mssql"));
    return false;
  }
  return true;
};

if (!hasDriver) {
  if (!run(["install", "mssql"], "npm install mssql")) process.exit(1);
  run(["install", "-D", "@types/mssql"], "npm install -D @types/mssql");
}

const installedNow = existsSync(join(cwd, "node_modules", "mssql", "package.json"));
console.log("");
console.log(installedNow ? green("✔ driver installed") : red("✘ driver still missing"));

const envFile = [".env.local", ".env"].map((file) => join(cwd, file)).find(existsSync);
if (!envFile) {
  console.log("");
  console.log(yellow("• No .env file yet. Copy .env.example to .env and fill the values."));
} else {
  const text = readFileSync(envFile, "utf8");
  const empty = ["DB_SERVER", "DB_DATABASE", "DB_USER", "DB_PASSWORD"].filter((key) => {
    const line = text.split(/\r?\n/).find((row) => row.trim().startsWith(`${key}=`));
    return !line || line.slice(line.indexOf("=") + 1).trim() === "";
  });
  console.log("");
  if (empty.length) console.log(yellow(`• ${empty.join(", ")} ${empty.length === 1 ? "is" : "are"} still empty in ${envFile}`));
  else console.log(green(`✔ ${envFile} has all four values`));
}

console.log("");
console.log(bold("Next: stop the dev server, delete .next, start it again, then open /menu"));
console.log("      Full connection test:  npm run db:check");
console.log("");
