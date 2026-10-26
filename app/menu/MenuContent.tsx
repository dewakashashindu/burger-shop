"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MENU_CATEGORIES,
  isMenuFilter,
  SRI_LANKAN_MENU,
  type MenuDish,
  type MenuFilter,
} from "../menu-data";
import type { MenuSnapshot } from "@/lib/menu-cache";
import type { MenuItem } from "@/lib/menu-source";

function MenuArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Isolate URL-dependent enhancement so the complete unfiltered menu remains
// server-rendered and readable with JavaScript disabled (Cache Components).
function MenuQuery({ onCategory }: { onCategory: (value: MenuFilter) => void }) {
  const params = useSearchParams();
  const requested = params.get("category");
  useEffect(() => { onCategory(isMenuFilter(requested) ? requested : "All dishes"); }, [requested, onCategory]);
  return null;
}

/**
 * Where the dishes on screen come from.
 *
 * The rows are read on the server (lib/menu-cache.ts) and arrive with the HTML,
 * so the page opens on the real menu. Nothing is swapped a moment later, and
 * the illustrative dishes in menu-data.ts never appear in front of a guest
 * unless no database has been configured at all.
 *
 * If the server could not read the database, one quiet retry from the browser
 * is made — a transient failure then heals itself when the guest reloads —
 * but the screen keeps saying "unavailable" until real rows arrive. It never
 * falls back to a made-up menu.
 */
type MenuSource = {
  state: "ok" | "unavailable" | "unconfigured";
  items: MenuDish[];
};

/** A database row has no `detail`; the card shows the description there. */
const toDishes = (items: MenuItem[]): MenuDish[] =>
  items.map((item) => ({ ...item, detail: item.description }));

const LAST_MENU_KEY = "microechef-last-menu";

/** The menu this browser saw last, so a returning guest opens on real dishes. */
function readLastMenu(): MenuDish[] | null {
  try {
    const raw = window.localStorage.getItem(LAST_MENU_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: MenuDish[] };
    if (Array.isArray(parsed?.items) && parsed.items.length) return parsed.items;
  } catch {
    /* private mode, or a stale shape — simply ask the server */
  }
  return null;
}

function rememberMenu(items: MenuDish[]) {
  try {
    window.localStorage.setItem(LAST_MENU_KEY, JSON.stringify({ at: Date.now(), items }));
  } catch {
    /* nothing to do — the server is the real source anyway */
  }
}

function useMenuSource(initial: MenuSnapshot | null | undefined): MenuSource {
  const [source, setSource] = useState<MenuSource>(() => {
    if (initial?.items?.length) return { state: "ok", items: toDishes(initial.items) };
    if (initial?.state === "unconfigured") return { state: "unconfigured", items: [] };
    if (initial?.state === "unavailable") return { state: "unavailable", items: [] };
    return { state: "ok", items: [] };
  });

  useEffect(() => {
    if (initial?.items?.length) {
      rememberMenu(toDishes(initial.items));
      return;
    }
    // No usable answer from the server: try once, silently, and prefer this
    // browser's last real menu while that attempt is in flight.
    let cancelled = false;
    const controller = new AbortController();
    const cached = initial?.state === "unconfigured" ? null : readLastMenu();
    // Deferred one tick: setting state synchronously inside an effect causes a
    // cascading render, and React's lint rules refuse it. One tick is invisible
    // to a guest and keeps this browser's last real menu on screen meanwhile.
    const tick = window.setTimeout(() => {
      if (!cancelled && cached) setSource({ state: "ok", items: cached });
    }, 0);
    fetch("/api/menu/items", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { state?: string; items?: MenuItem[] } | null) => {
        if (cancelled) return;
        if (Array.isArray(data?.items) && data.items.length) {
          const items = toDishes(data.items);
          setSource({ state: "ok", items });
          rememberMenu(items);
        } else if (initial?.state !== "unconfigured") {
          setSource({ state: "unavailable", items: [] });
        }
      })
      .catch(() => {
        /* Keep whatever is on screen. */
      });
    return () => { cancelled = true; controller.abort(); window.clearTimeout(tick); };
  }, [initial]);

  return source;
}

type Collection = {
  name: string;
  dishes: MenuDish[];
  count: number;
  subCount: number;
  cover: MenuDish;
};

const uniq = (values: string[]) => Array.from(new Set(values)).filter(Boolean);

export default function MenuContent({
  initialCategory = "All dishes",
  menu,
  onDish,
  onBooking,
}: {
  initialCategory?: MenuFilter;
  /** The rows the server read. Absent only on an older page or a bare clone. */
  menu?: MenuSnapshot | null;
  onDish: (dish: MenuDish) => void;
  onBooking: () => void;
}) {
  const source = useMenuSource(menu);
  // A database that has not been configured at all is a demo, not a fault: the
  // illustrative dishes are then the only menu there is, and they are labelled
  // as such. A configured but unreachable database is a fault, and is said so.
  const demo = source.state === "unconfigured";
  const items = demo ? SRI_LANKAN_MENU : source.items;
  const showPrices = !demo && source.state === "ok";
  const [category, setCategory] = useState<MenuFilter>(initialCategory);
  // Level 2 = L1Des (KIDS MENU, LUNCH & DINNER…), level 3 = L2Des (RICE, CURRY…).
  // An empty group means the tab has no sub categories and shows its dishes.
  const [group, setGroup] = useState("");
  const [sub, setSub] = useState("");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const applyURLCategory = useCallback((value: MenuFilter) => {
    setCategory(value);
    setGroup("");
    setSub("");
  }, []);

  // The database stores the top tab as a code (F, B, O). The API already sends a
  // readable label, so the tabs read Food / Beverage / Other — never F / B / O.
  const isLive = !demo && source.state === "ok";
  const labelOf = (dish: MenuDish) => dish.categoryLabel || dish.category;
  const topTabs = isLive
    ? Array.from(new Set(items.map(labelOf)))
    : [...MENU_CATEGORIES];
  const filters: MenuFilter[] = ["All dishes", ...topTabs];

  const inCategory = category === "All dishes" ? items : items.filter((dish) => labelOf(dish) === category);
  const groupNames = category === "All dishes" ? [] : uniq(inCategory.map((dish) => dish.group || ""));
  // Every dish that belongs to the open sub category (used for counts + browsing).
  const inGroup = group ? inCategory.filter((dish) => dish.group === group) : inCategory;
  const subNames = group ? uniq(inGroup.map((dish) => dish.subGroup || "")) : [];

  // Sub categories are shown as cards — the same card shape as a dish, only a
  // little different — and only where a level actually has them.
  let collections: Collection[] = [];
  let visible: MenuDish[];

  if (category === "All dishes") {
    visible = items;
  } else if (!group) {
    collections = groupNames.map((name) => {
      const dishes = inCategory.filter((dish) => dish.group === name);
      return {
        name,
        dishes,
        count: dishes.length,
        subCount: uniq(dishes.map((dish) => dish.subGroup || "")).length,
        cover: dishes[0],
      };
    });
    visible = inCategory.filter((dish) => !dish.group);
  } else if (!sub) {
    collections = subNames.map((name) => {
      const dishes = inGroup.filter((dish) => dish.subGroup === name);
      return { name, dishes, count: dishes.length, subCount: 0, cover: dishes[0] };
    });
    visible = inGroup.filter((dish) => !dish.subGroup);
  } else {
    visible = inGroup.filter((dish) => dish.subGroup === sub);
  }

  const query = search.trim().toLocaleLowerCase();
  if (query) {
    // A search looks through everything in the open tab, not just this level.
    collections = [];
    visible = inCategory;
  }
  visible = visible.filter((dish) =>
    `${dish.name} ${dish.description} ${dish.categoryLabel ?? dish.category} ${dish.group ?? ""} ${dish.subGroup ?? ""}`
      .toLocaleLowerCase()
      .includes(query),
  );

  // Distinct cover photos so two cards never show the same dish twice in a row.
  const usedCovers = new Set<string>();
  const covers = collections.map((collection) => {
    const pick = collection.dishes.find((dish) => !usedCovers.has(dish.image)) || collection.cover;
    usedCovers.add(pick.image);
    return pick;
  });

  const heading = sub || group || (category !== "All dishes" ? category : "Little favourites. Island flavour.");
  const statusBits: string[] = [];
  if (collections.length) statusBits.push(`${collections.length} sub ${collections.length === 1 ? "category" : "categories"}`);
  if (visible.length) statusBits.push(`${visible.length} ${visible.length === 1 ? "dish" : "dishes"}${sub ? ` in ${sub}` : group ? ` in ${group}` : category !== "All dishes" ? ` in ${category}` : ""}`);
  else if (collections.length && category !== "All dishes") statusBits.push(`${inCategory.length} dishes in ${category}`);
  const status = statusBits.join(" · ") || "No dishes yet";

  const openCollection = (name: string) => {
    if (group) {
      setSub(name);
    } else {
      setGroup(name);
      setSub("");
    }
    if (search) setSearch("");
    document.getElementById("menu-catalog")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const goTo = (level: "all" | "category" | "group") => {
    setSearch("");
    if (level === "all") { setCategory("All dishes"); setGroup(""); setSub(""); }
    if (level === "category") { setGroup(""); setSub(""); }
    if (level === "group") { setSub(""); }
  };

  // The database is configured but could not be read. Say so, plainly, and do
  // not invent a menu — a guest who orders from a photograph of a dish the
  // kitchen stopped serving is worse than a guest who is told to call.
  if (source.state === "unavailable") {
    return (
      <div className="warm-menu">
        <Suspense fallback={null}><MenuQuery onCategory={applyURLCategory} /></Suspense>
        <section className="wm-hero wm-wrap" aria-labelledby="menu-heading">
          <div className="wm-hero-copy">
            <span className="eyebrow">THE MENU / SRI LANKAN FAVOURITES</span>
            <h1 id="menu-heading">The menu is<br /><em>being plated.</em></h1>
            <p>Our kitchen’s list could not be reached just now.<br />Please try again in a moment.</p>
            <div className="wm-hero-note"><i aria-hidden="true" />Good food. Made for good company.</div>
          </div>
        </section>
        <section className="wm-catalog wm-wrap">
          <div className="wm-empty">
            <h3>The menu isn’t loading.</h3>
            <p>
              Prices and dishes always come from the restaurant itself, so nothing is shown rather
              than something that might be wrong. Call <a href="tel:0772336233">077 233 6233</a> and
              we’ll read it out to you, or try the page again.
            </p>
            <button className="button button-dark" onClick={() => window.location.reload()}>
              Try again <MenuArrow />
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="warm-menu">
      <Suspense fallback={null}><MenuQuery onCategory={applyURLCategory} /></Suspense>
      <section className="wm-hero wm-wrap" aria-labelledby="menu-heading">
        <div className="wm-hero-copy">
          <span className="eyebrow">THE MENU / SRI LANKAN FAVOURITES</span>
          <h1 id="menu-heading">Your next<br /><em>favourite bite.</em></h1>
          <p>From rice &amp; curry to crisp hoppers.<br />Sri Lankan comfort, made to share.</p>
          <div className="wm-hero-note"><i aria-hidden="true" />Good food. Made for good company.</div>
        </div>
        <button className="wm-hero-media" onClick={() => onDish(items[0])} aria-label={`View featured ${items[0].name}`}>
          <Image width={1200} height={900} src={items[0].image} alt={items[0].alt} sizes="(max-width: 767px) 100vw, 50vw" loading="eager" fetchPriority="high" unoptimized={items[0].image.startsWith("/api/")} />
          <span className="wm-hero-label"><span><b>{items[0].group || items[0].note || "A plate of home"}</b><small>{items[0].name.toUpperCase()} / {labelOf(items[0]).toUpperCase()}</small></span><MenuArrow /></span>
        </button>
      </section>

      <section className="wm-catalog wm-wrap" id="menu-catalog" aria-labelledby="menu-catalog-heading">
        <div className="wm-category-panel">
          <p className="eyebrow">Explore the menu</p>
          <div className="wm-category-list" role="group" aria-label="Filter menu by category">
            {filters.map((filter) => (
              <button key={filter} type="button" aria-pressed={category === filter} onClick={(event) => {
                setCategory(filter);
                setGroup("");
                setSub("");
                setSearch("");
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
              }}>
                {filter}<span>{filter === "All dishes" ? items.length : items.filter((dish) => labelOf(dish) === filter).length}</span>
              </button>
            ))}
          </div>
        </div>

        {category !== "All dishes" && (
          <nav className="wm-crumbs" aria-label="Menu path">
            <button type="button" onClick={() => goTo("all")}>All dishes</button>
            <span aria-hidden="true">/</span>
            {group ? <button type="button" onClick={() => goTo("category")}>{category}</button> : <span>{category}</span>}
            {group && (<><span aria-hidden="true">/</span>{sub ? <button type="button" onClick={() => goTo("group")}>{group}</button> : <span>{group}</span>}</>)}
            {sub && (<><span aria-hidden="true">/</span><span>{sub}</span></>)}
          </nav>
        )}

        <div className="wm-catalog-top">
          <div><h2 id="menu-catalog-heading">{heading}</h2><p role="status">{status}{showPrices ? "" : " · prices to be confirmed"}</p></div>
          <label className="wm-search">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.5" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5" /></svg>
            <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search dishes" placeholder="Find your favourite…" autoComplete="off" />
            {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); searchRef.current?.focus(); }}>×</button>}
          </label>
        </div>

        <div className="wm-dish-grid">
          {collections.map((collection, index) => {
            const cover = covers[index];
            const names = collection.dishes.slice(0, 3).map((dish) => dish.name).join(", ");
            const more = collection.count > 3 ? ` + ${collection.count - 3} more` : "";
            const meta = [collection.subCount ? `${collection.subCount} sub ${collection.subCount === 1 ? "category" : "categories"}` : "", `${collection.count} ${collection.count === 1 ? "dish" : "dishes"}`].filter(Boolean).join(" · ");
            return (
              <article
                className="wm-dish-card is-coll"
                key={`collection-${collection.name}-${index}`}
                role="button"
                tabIndex={0}
                aria-label={`Open ${collection.name}, ${meta}`}
                onClick={() => openCollection(collection.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openCollection(collection.name);
                  }
                }}
              >
                <div className="wm-dish-photo">
                  <Image width={1200} height={900} src={cover.image} alt={cover.alt} sizes="(max-width: 767px) 50vw, (max-width: 1024px) 45vw, 30vw" loading="lazy" unoptimized={cover.image.startsWith("/api/")} />
                  <span className="wm-dish-num">{collection.count} {collection.count === 1 ? "dish" : "dishes"}</span>
                </div>
                <div className="wm-dish-info">
                  <span className="eyebrow">Sub category</span>
                  <h3>{collection.name}</h3>
                  <p>{names}{more}</p>
                  <div className="wm-dish-bottom">
                    <span className="coll-meta">{meta}</span>
                    <span className="wm-dish-open" aria-hidden="true"><MenuArrow /></span>
                  </div>
                </div>
              </article>
            );
          })}

          {visible.map((dish) => (
            <article className="wm-dish-card" key={dish.id}>
              <div className="wm-dish-photo">
                <Image width={1200} height={900} src={dish.image} alt={dish.alt} sizes="(max-width: 767px) 50vw, (max-width: 1024px) 45vw, 30vw" loading="lazy" unoptimized={dish.image.startsWith("/api/")} />
                <span className="wm-dish-num">{String(items.indexOf(dish) + 1).padStart(2, "0")} / {dish.group || labelOf(dish)}</span>
              </div>
              <div className="wm-dish-info">
                <span className="eyebrow">{[labelOf(dish), dish.subGroup].filter(Boolean).join(" · ") || dish.note}</span>
                <h3>{dish.name}</h3>
                <p>{dish.description}</p>
                <div className="wm-dish-bottom"><span>{dish.price ? `LKR ${dish.price.toLocaleString("en-US")}` : "Price to confirm"}</span><button className="wm-dish-open" onClick={() => onDish(dish)} aria-label={`View ${dish.name}`}><MenuArrow /></button></div>
              </div>
            </article>
          ))}
        </div>
        {visible.length === 0 && collections.length === 0 && (
          <div className="wm-empty"><h3>A little different, perhaps?</h3><p>No dishes match this search. Try another word or category.</p><button className="button button-dark" onClick={() => { setCategory("All dishes"); setGroup(""); setSub(""); setSearch(""); searchRef.current?.focus(); }}>Show the full menu <MenuArrow /></button></div>
        )}
        <div className="wm-menu-care"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 21c1-6 3-12 7-18M10 15C4 15 3 10 3 7c5 1 8 4 7 8Zm3-5C12 5 15 2 19 2c1 5-1 8-6 8Z" stroke="currentColor" strokeWidth="1.3" /></svg><p>Have an allergy or a dietary requirement? Please check with the restaurant before ordering. Please confirm ingredients, prices and availability with the restaurant.</p></div>
      </section>
      <section className="wm-invite wm-wrap"><span className="eyebrow">A LITTLE PAUSE. A LOVELY MEAL.</span><h2>Looks good?<br /><em>Save yourself a seat.</em></h2><button className="button button-dark" onClick={onBooking}>Find your table <MenuArrow /></button></section>
    </div>
  );
}

export function MenuDishDetails({ dish }: { dish: MenuDish }) {
  return (
    <div className="wm-dish-details">
      <Image width={1200} height={900} src={dish.image} alt={dish.alt} sizes="(max-width: 767px) 100vw, 40vw" unoptimized={dish.image.startsWith("/api/")} />
      <div><span className="eyebrow">{[dish.categoryLabel || dish.category, dish.group, dish.subGroup].filter(Boolean).join(" / ")}</span><h3>{dish.note}</h3><p>{dish.detail}</p><b>{dish.price ? `LKR ${dish.price.toLocaleString("en-US")}` : "Price to be confirmed"}</b><div className="wm-dish-notice">Please confirm the recipe, portion, availability and all allergen or dietary information with the restaurant before ordering. This is not an allergen guide.</div></div>
    </div>
  );
}
