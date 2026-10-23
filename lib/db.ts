import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Read-only connection to the restaurant's SQL Server.
 *
 * The driver (`mssql`) is loaded lazily at runtime. If the package is not
 * installed, or the .env values are missing, this module simply reports
 * "not available" — the menu page then keeps its built-in dishes instead of
 * breaking the whole site.
 */

export type SqlRequest = {
  input(name: string, type: unknown, value: unknown): SqlRequest;
  query<T>(statement: string): Promise<{ recordset?: T[] }>;
};

export type SqlPool = {
  request(): SqlRequest;
};

type SqlModule = {
  ConnectionPool: new (config: Record<string, unknown>) => { connect(): Promise<SqlPool> };
  VarChar: (length?: number) => unknown;
};

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

type GlobalStore = typeof globalThis & {
  __microechefSql?: SqlModule | null;
  __microechefPool?: Promise<SqlPool>;
};

const store = globalThis as GlobalStore;

function asModule(loaded: unknown): SqlModule | null {
  const candidate = ((loaded as { default?: SqlModule })?.default ?? loaded) as
    | (SqlModule & { default?: SqlModule })
    | undefined;
  const resolved = (candidate?.default ?? candidate) as SqlModule | undefined;
  return resolved && typeof resolved.ConnectionPool === "function" ? resolved : null;
}

/**
 * Resolves `mssql` from the project folder (where `npm install` puts it),
 * not from the compiled chunk inside `.next`. That difference matters on a
 * machine where the packaged output lives in a nested folder.
 */
export function resolveSqlPath(): string | null {
  try {
    const requireFromProject = createRequire(pathToFileURL(join(process.cwd(), "package.json")));
    return requireFromProject.resolve("mssql");
  } catch {
    return null;
  }
}

/** Loads the driver once. Returns null when it is not installed. */
export async function loadSql(): Promise<SqlModule | null> {
  if (store.__microechefSql !== undefined) return store.__microechefSql;

  // 1. Plain dynamic import (keeps the bundler out of it).
  try {
    const specifier = "mssql";
    const loaded = asModule(await import(/* turbopackIgnore: true */ specifier));
    if (loaded) {
      store.__microechefSql = loaded;
      return loaded;
    }
  } catch {
    /* try the project folder next */
  }

  // 2. Resolve from the project root, then load it.
  try {
    const requireFromProject = createRequire(pathToFileURL(join(process.cwd(), "package.json")));
    const loaded = asModule(requireFromProject("mssql"));
    if (loaded) {
      store.__microechefSql = loaded;
      return loaded;
    }
  } catch {
    /* not installed */
  }

  console.warn(
    `[menu] the SQL driver (mssql) is not installed in ${process.cwd()} — ` +
      "run: npm install mssql (or: npm run db:setup)",
  );
  store.__microechefSql = null;
  return null;
}

/** Where the driver was found (for /api/menu/health). */
export function sqlDiagnostics() {
  return {
    cwd: process.cwd(),
    driverPath: resolveSqlPath(),
    nodeModulesMssql: resolveSqlPath() !== null,
  };
}

export function isDbConfigured() {
  return Boolean(
    process.env.DB_SERVER?.trim() &&
      process.env.DB_DATABASE?.trim() &&
      process.env.DB_USER?.trim(),
  );
}

/** True only when both the driver and the .env values are present. */
export async function isDbReady() {
  return isDbConfigured() && Boolean(await loadSql());
}

/** Splits "HOST\\INSTANCE" (or DB_INSTANCE) into the parts mssql expects. */
export function serverParts() {
  const raw = (process.env.DB_SERVER ?? "").trim();
  const [host, inlineInstance] = raw.split(/[\\/]/);
  const instance = (process.env.DB_INSTANCE ?? inlineInstance ?? "").trim();
  return { server: host || raw, instance };
}

/** A safe summary for /api/menu/health — never includes the password. */
export function dbConfigSummary() {
  const { server, instance } = serverParts();
  return {
    server,
    instance: instance || null,
    port: process.env.DB_PORT?.trim() || "1433 (default)",
    database: process.env.DB_DATABASE?.trim() || null,
    user: process.env.DB_USER?.trim() || null,
    passwordSet: Boolean(process.env.DB_PASSWORD),
    encrypt: process.env.DB_ENCRYPT?.trim() || "false (default)",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT?.trim() || "true (default)",
  };
}

export async function getPool(): Promise<SqlPool> {
  const sql = await loadSql();
  if (!sql) throw new Error("SQL driver (mssql) is not installed. Run: npm install mssql");
  if (!isDbConfigured()) throw new Error("Database is not configured (.env).");

  if (!store.__microechefPool) {
    const { server, instance } = serverParts();
    const config: Record<string, unknown> = {
      server,
      // A named instance (e.g. SQL Server Express) uses SQL Browser for its port.
      ...(instance ? { options: { instanceName: instance } } : {}),
      port: toNumber(process.env.DB_PORT, 1433),
      database: process.env.DB_DATABASE!.trim(),
      user: process.env.DB_USER!.trim(),
      password: process.env.DB_PASSWORD ?? "",
      connectionTimeout: toNumber(process.env.DB_CONNECT_TIMEOUT, 8000),
      requestTimeout: toNumber(process.env.DB_REQUEST_TIMEOUT, 12000),
      options: {
        ...(instance ? { instanceName: instance } : {}),
        encrypt: toBoolean(process.env.DB_ENCRYPT, false),
        trustServerCertificate: toBoolean(process.env.DB_TRUST_SERVER_CERT, true),
      },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    };
    store.__microechefPool = new sql.ConnectionPool(config).connect().catch((error: unknown) => {
      store.__microechefPool = undefined;
      throw error;
    });
  }
  return store.__microechefPool;
}
