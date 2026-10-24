import { getPool, isDbConfigured, loadSql } from "./db";

/**
 * The floor plan, read-only.
 *
 * dbo.Tbl_TableGroup → the dining areas (GroupID 001, GroupName "A. Ground Floor").
 * dbo.Tbl_Tables      → the tables themselves, joined back on EITHER the group id
 *                       or the group name, because different POS builds write one
 *                       or the other into Tbl_Tables.TableGroup.
 * dbo.Tbl_LocationMaster → the restaurants a guest can book at (SubLoc = 0).
 *
 * Everything is tolerant: when the database is missing, or a column does not
 * exist in this particular POS build, the page keeps a neutral answer instead
 * of breaking.
 */

export type TableGroup = { id: string; name: string; tableCount: number };
export type RestaurantTable = {
  no: string;
  group: string; // the raw value held in Tbl_Tables.TableGroup
  groupName: string; // the name it resolves to
  vacant: boolean | null; // 'Y' vacant, 'N' occupied
  listingOrder: number;
};
export type TableLocation = { code: string; name: string };

export type FloorPlan = {
  groups: TableGroup[];
  tables: RestaurantTable[];
  locations: TableLocation[];
};

const CLEAN = (value: unknown) => (typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim());
const ORDER = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 999999;
};

/** The group id / name compare exactly as the note asks: trimmed, case-insensitive. */
const GROUPS_SQL = `
  SELECT LTRIM(RTRIM(g.GroupID))   AS GroupID,
         LTRIM(RTRIM(g.GroupName)) AS GroupName,
         (SELECT COUNT(*)
            FROM dbo.Tbl_Tables AS t WITH (NOLOCK)
           WHERE ISNULL(t.Enable, 1) = 1
             AND (LTRIM(RTRIM(t.TableGroup)) = LTRIM(RTRIM(g.GroupID))
               OR LTRIM(RTRIM(t.TableGroup)) = LTRIM(RTRIM(g.GroupName)))) AS TableCount
    FROM dbo.Tbl_TableGroup AS g WITH (NOLOCK)
   WHERE ISNULL(g.Enable, 1) = 1
   ORDER BY LTRIM(RTRIM(g.GroupName)), LTRIM(RTRIM(g.GroupID))`;

const TABLES_SQL = `
  SELECT LTRIM(RTRIM(t.TableNo))     AS TableNo,
         LTRIM(RTRIM(t.TableGroup))  AS TableGroup,
         LTRIM(RTRIM(ISNULL(g.GroupName, t.TableGroup))) AS GroupName,
         ISNULL(t.Vaccant, 'Y')      AS Vaccant,
         ISNULL(t.ListingOrder, 999999) AS ListingOrder
    FROM dbo.Tbl_Tables AS t WITH (NOLOCK)
    LEFT JOIN dbo.Tbl_TableGroup AS g WITH (NOLOCK)
      ON LTRIM(RTRIM(g.GroupID))   = LTRIM(RTRIM(t.TableGroup))
      OR LTRIM(RTRIM(g.GroupName)) = LTRIM(RTRIM(t.TableGroup))
   WHERE ISNULL(t.Enable, 1) = 1
   ORDER BY ISNULL(g.GroupName, LTRIM(RTRIM(t.TableGroup))) ASC,
            ISNULL(t.ListingOrder, 999999) ASC,
            LTRIM(RTRIM(t.TableNo)) ASC`;

export async function readFloorPlan(): Promise<{ ok: boolean; reason?: string; floor: FloorPlan }> {
  const empty: FloorPlan = { groups: [], tables: [], locations: [] };

  const sql = await loadSql();
  if (!sql) return { ok: false, reason: "driver-missing", floor: empty };
  if (!isDbConfigured()) return { ok: false, reason: "not-configured", floor: empty };

  try {
    const pool = await getPool();

    const groupRows = (await pool.request().query<{ GroupID: unknown; GroupName: unknown; TableCount: unknown }>(GROUPS_SQL)).recordset ?? [];
    const tableRows = (await pool.request().query<{ TableNo: unknown; TableGroup: unknown; GroupName: unknown; Vaccant: unknown; ListingOrder: unknown }>(TABLES_SQL)).recordset ?? [];

    let locationRows: { LocCode: unknown; LocDes: unknown }[] = [];
    try {
      locationRows =
        (await pool.request().query<{ LocCode: unknown; LocDes: unknown }>(
          `SELECT LocCode, LocDes
             FROM dbo.Tbl_LocationMaster WITH (NOLOCK)
            WHERE ISNULL(SubLoc, 0) = 0 AND ISNULL(Enable, 1) = 1
            ORDER BY LocCode`,
        )).recordset ?? [];
    } catch {
      locationRows = [];
    }

    const groups: TableGroup[] = groupRows
      .map((row) => ({ id: CLEAN(row.GroupID), name: CLEAN(row.GroupName), tableCount: Number(row.TableCount) || 0 }))
      .filter((group) => group.id || group.name);

    const tables: RestaurantTable[] = tableRows
      .map((row) => {
        const vacantRaw = CLEAN(row.Vaccant).toUpperCase();
        return {
          no: CLEAN(row.TableNo),
          group: CLEAN(row.TableGroup),
          groupName: CLEAN(row.GroupName),
          // Anything other than a clear Y/N is reported as "unknown" rather than guessed.
          vacant: vacantRaw === "Y" ? true : vacantRaw === "N" ? false : null,
          listingOrder: ORDER(row.ListingOrder),
        };
      })
      .filter((table) => table.no);

    const locations: TableLocation[] = locationRows
      .map((row) => ({ code: CLEAN(row.LocCode), name: CLEAN(row.LocDes) }))
      .filter((location) => location.code);

    return { ok: true, floor: { groups, tables, locations } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `database: ${message}`, floor: empty };
  }
}
