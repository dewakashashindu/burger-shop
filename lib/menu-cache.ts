import { isDbConfigured } from "./db";
import { readMenuItems, type MenuItem } from "./menu-source";

/**
 * The kitchen's menu, read on the server and remembered for a minute.
 *
 * Why this exists: the menu page and the order page used to render a built-in
 * set of illustrative dishes in the HTML and then replace them with the live
 * rows a moment later, once a browser fetch came back. On a real restaurant
 * that means every single visitor sees the WRONG dishes first — rice & curry,
 * kottu and hoppers that are not on the menu — and only then the 237 dishes the
 * kitchen actually sells. On a slow database that glimpse lasts a second or
 * more; when the database is unreachable it never goes away at all.
 *
 * Reading the rows here, on the server, before the page is rendered removes
 * that window entirely: the first byte of HTML already carries the real menu.
 *
 * `state` says what happened, so the pages can be honest about it:
 *
 *   "ok"           rows came back — show them, nothing else
 *   "unavailable"  the database is configured but could not be read — say so
 *                  rather than inventing a menu (the built-in dishes are
 *                  illustrative, not the restaurant's offering)
 *   "unconfigured" no database is configured at all (a fresh clone) — the
 *                  built-in dishes are then a demo, and the only menu there is
 *
 * A failed read is remembered for only ten seconds, so a database that comes
 * back is used again almost immediately, and a broken one cannot make every
 * page load wait for a fresh connection attempt.
 */

export type MenuState = "ok" | "unavailable" | "unconfigured";

export type MenuSnapshot = {
  state: MenuState;
  items: MenuItem[];
  /** When the rows were read (ms), or null when there are none. */
  at: number | null;
};

const FRESH_MS = 60_000;
const RETRY_MS = 10_000;

let cache: { snapshot: MenuSnapshot; expires: number } | null = null;
let inFlight: Promise<MenuSnapshot> | null = null;

const empty = (state: MenuState): MenuSnapshot => ({ state, items: [], at: null });

export async function getMenuSnapshot(): Promise<MenuSnapshot> {
  if (!isDbConfigured()) return empty("unconfigured");

  const now = Date.now();
  if (cache && now < cache.expires) return cache.snapshot;
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<MenuSnapshot> => {
    try {
      const items = await readMenuItems();
      const snapshot: MenuSnapshot = items.length
        ? { state: "ok", items, at: Date.now() }
        : empty("unavailable");
      // A minute of freshness; an empty answer may be a permissions problem,
      // so it is retried sooner.
      cache = { snapshot, expires: Date.now() + (items.length ? FRESH_MS : RETRY_MS) };
      return snapshot;
    } catch (error) {
      console.error("[menu] the live menu could not be read:", error);
      // Serve the last good rows while the database is down — stale prices beat
      // an empty page, and the next read replaces them.
      if (cache?.snapshot.items.length) {
        const stale = cache.snapshot;
        cache = { snapshot: stale, expires: Date.now() + RETRY_MS };
        return stale;
      }
      const snapshot = empty("unavailable");
      cache = { snapshot, expires: Date.now() + RETRY_MS };
      return snapshot;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** For /api/menu/health — never includes the password. */
export function menuCacheReport() {
  return {
    cached: Boolean(cache),
    ageSeconds: cache?.snapshot.at ? Math.round((Date.now() - cache.snapshot.at) / 1000) : null,
    count: cache?.snapshot.items.length ?? 0,
    state: cache?.snapshot.state ?? null,
  };
}
