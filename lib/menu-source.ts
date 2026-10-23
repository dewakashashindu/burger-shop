import { getPool, isDbConfigured, loadSql } from "./db";
import { categoryLabel } from "./menu-category-labels";

/**
 * Menu READ side only (no cart / order writes).
 * Source of truth: dbo.Vw_MenuAssignment + dbo.Tbl_MenuItems, as described in the
 * restaurant's QR menu note.
 */

export type DbMenuRow = {
  MenuItemCode: string;
  MenuItmDes: string;
  SalesPrice: number | string | null;
  Category: string | null;
  Level1: string | number | null;
  L1Des: string | null;
  Level2: string | number | null;
  L2Des: string | null;
  L1LitingOrder?: number | null;
  LISTINGORDER?: number | null;
  DisplayItemDes: string | null;
  HasPicture?: number | boolean | null;
};

export type MenuItem = {
  id: string;
  name: string;
  /** Raw value from a.Category (F, B, O …). Kept for filtering. */
  category: string;
  /** What the guest reads: F → Food, B → Beverage, O → Other. */
  categoryLabel: string;
  group: string;
  subGroup: string;
  note: string;
  description: string;
  price: number;
  image: string;
  alt: string;
};

const FALLBACK_IMAGE = "/images/rice-and-curry.jpg";

const SELECT_LIST = `
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

const FROM_JOIN = `
  FROM dbo.Vw_MenuAssignment AS a WITH (NOLOCK)
  INNER JOIN dbo.Tbl_MenuItems AS m WITH (NOLOCK)
    ON m.MenuItmId = a.MenuItemCode`;

const ORDER_BY = `
  ORDER BY ISNULL(a.Category, ''), ISNULL(a.L1LitingOrder, 0), ISNULL(a.LISTINGORDER, 0), a.MenuItmDes`;

// The availability column lives on the view in most installations and on the item
// table in others, so the query is tried in order until one shape matches.
export const VARIANTS = [
  `SELECT ${SELECT_LIST}${FROM_JOIN}
   WHERE a.DisplayInFront = '1'
     AND a.MenuAssiEnable = '1'
     AND a.MenuItemEnable = '1'
     AND ISNULL(a.ItemNotAvailable, 0) = 0${ORDER_BY}`,
  `SELECT ${SELECT_LIST}${FROM_JOIN}
   WHERE a.DisplayInFront = '1'
     AND a.MenuAssiEnable = '1'
     AND a.MenuItemEnable = '1'
     AND ISNULL(m.ItemNotAvailable, 0) = 0${ORDER_BY}`,
  `SELECT ${SELECT_LIST}${FROM_JOIN}
   WHERE a.DisplayInFront = '1'
     AND a.MenuAssiEnable = '1'
     AND a.MenuItemEnable = '1'${ORDER_BY}`,
];

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

/** Pure mapper — no database access, so it can be unit-tested. */
export function mapRows(rows: DbMenuRow[]): MenuItem[] {
  const seen = new Set<string>();
  return rows
    .map((row) => {
      const id = text(row.MenuItemCode);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      const name = text(row.MenuItmDes);
      const description = text(row.DisplayItemDes);
      const group = text(row.L1Des);
      const rawCategory = text(row.Category) || group;
      const category = rawCategory || "From our kitchen";
      return {
        id,
        name: name || id,
        category,
        categoryLabel: categoryLabel(rawCategory),
        group,
        subGroup: text(row.L2Des),
        note: text(row.L2Des) || group || text(row.Category),
        description,
        price: Number(row.SalesPrice) || 0,
        image: Number(row.HasPicture) ? `/api/menu/image/${encodeURIComponent(id)}` : FALLBACK_IMAGE,
        alt: description || name || "Dish from the Mila Mirissa kitchen",
      } satisfies MenuItem;
    })
    .filter((item): item is MenuItem => item !== null);
}

/** Step-by-step report used by /api/menu/health and scripts/db-check.mjs. */
export async function diagnose() {
  const steps: { step: string; ok: boolean; detail: string }[] = [];
  const add = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });

  const sql = await loadSql();
  add("1. driver", Boolean(sql), sql ? "mssql is installed" : "mssql is missing — run: npm install mssql");
  if (!sql) return { steps, items: [] as MenuItem[], variant: null };

  const configured = isDbConfigured();
  add("2. .env", configured, configured
    ? "DB_SERVER, DB_DATABASE and DB_USER are set"
    : "DB_SERVER / DB_DATABASE / DB_USER are empty");
  if (!configured) return { steps, items: [] as MenuItem[], variant: null };

  let pool;
  try {
    pool = await getPool();
    add("3. connect", true, "logged in to SQL Server");
  } catch (error) {
    add("3. connect", false, describeError(error));
    return { steps, items: [] as MenuItem[], variant: null };
  }

  let lastError: unknown = null;
  for (let index = 0; index < VARIANTS.length; index++) {
    try {
      const result = await pool.request().query<DbMenuRow>(VARIANTS[index]);
      const rows = result.recordset ?? [];
      const items = mapRows(rows);
      const label = index === 0 ? "ItemNotAvailable on the view"
        : index === 1 ? "ItemNotAvailable on the item table"
        : "no ItemNotAvailable filter";
      add("4. query", true, `variant ${index + 1} (${label}) → ${rows.length} rows → ${items.length} dishes`);
      add("5. result", items.length > 0,
        items.length > 0
          ? `first dish: ${items[0].name} · LKR ${items[0].price}`
          : "the query ran but returned no rows — check DisplayInFront / MenuAssiEnable / MenuItemEnable");
      if (items.length) {
        const tops = new Map<string, { label: string; count: number; groups: Set<string> }>();
        for (const item of items) {
          const entry = tops.get(item.category) ?? { label: item.categoryLabel, count: 0, groups: new Set<string>() };
          entry.count += 1;
          if (item.group) entry.groups.add(item.group);
          tops.set(item.category, entry);
        }
        add(
          "6. categories",
          true,
          Array.from(tops.entries())
            .map(([code, info]) => `${code || "(blank)"} → “${info.label}” · ${info.count} dishes · ${info.groups.size} sub categories`)
            .join(" | "),
        );
      }
      return { steps, items, variant: index + 1 };
    } catch (error) {
      lastError = error;
      add(`4. query (variant ${index + 1})`, false, describeError(error));
      const message = error instanceof Error ? error.message : String(error);
      if (!/Invalid column name|Invalid object name/i.test(message)) break;
    }
  }
  add("5. result", false, describeError(lastError));
  return { steps, items: [] as MenuItem[], variant: null };
}

function describeError(error: unknown) {
  const err = error as { message?: string; code?: string; number?: number } | undefined;
  const bits = [err?.code, err?.number ? `error ${err.number}` : "", err?.message ?? String(error)]
    .filter(Boolean)
    .join(" · ");
  return bits || "unknown error";
}

export async function readMenuItems(): Promise<MenuItem[]> {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  const pool = await getPool();
  let lastError: unknown = null;
  for (const query of VARIANTS) {
    try {
      const result = await pool.request().query<DbMenuRow>(query);
      const items = mapRows(result.recordset ?? []);
      if (items.length) console.info(`[menu] ${items.length} dishes loaded from SQL Server`);
      else console.warn("[menu] the query returned no rows — the built-in menu is shown");
      return items;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // Only fall through when the column is missing; anything else is a real failure.
      if (!/Invalid column name|Invalid object name/i.test(message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Menu query failed.");
}

export async function readMenuImage(code: string): Promise<Buffer | null> {
  const sql = await loadSql();
  if (!sql) throw new Error("SQL driver (mssql) is not installed.");
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  const pool = await getPool();
  const result = await pool
    .request()
    .input("code", sql.VarChar(50), code)
    .query<{ ItemPicMob: Buffer | null }>(
      `SELECT TOP (1) m.ItemPicMob
       FROM dbo.Tbl_MenuItems AS m WITH (NOLOCK)
       WHERE m.MenuItmId = @code`,
    );
  const picture = result.recordset?.[0]?.ItemPicMob;
  return picture && picture.length ? Buffer.from(picture) : null;
}
