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

// The built-in menu is rendered on the server, so the page is complete without
// JavaScript. If the restaurant database answers, the same screen is replaced
// with the live rows (and their prices) a moment later.
function useLiveMenu() {
  const [live, setLive] = useState<MenuDish[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/menu/items", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { items?: MenuDish[] } | null) => {
        if (!cancelled && Array.isArray(data?.items) && data.items.length) {
          setLive(data.items.map((item) => ({ ...item, detail: item.detail ?? item.description })));
        }
      })
      .catch(() => {
        /* Keep the built-in menu. */
      });
    return () => { cancelled = true; controller.abort(); };
  }, []);
  return live;
}

export default function MenuContent({
  initialCategory = "All dishes",
  onDish,
  onBooking,
}: {
  initialCategory?: MenuFilter;
  onDish: (dish: MenuDish) => void;
  onBooking: () => void;
}) {
  const live = useLiveMenu();
  const items = live ?? SRI_LANKAN_MENU;
  const showPrices = Boolean(live);
  const [category, setCategory] = useState<MenuFilter>(initialCategory);
  const [subCategory, setSubCategory] = useState("");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const applyURLCategory = useCallback((value: MenuFilter) => {
    setCategory(value);
    setSubCategory("");
  }, []);

  // The database stores the top tab as a code (F, B, O). The API already sends a
  // readable label, so the tabs read Food / Beverage / Other — never F / B / O.
  const isLive = Boolean(live);
  const labelOf = (dish: MenuDish) => dish.categoryLabel || dish.category;
  const topTabs = isLive
    ? Array.from(new Set(items.map(labelOf)))
    : [...MENU_CATEGORIES];
  const filters: MenuFilter[] = ["All dishes", ...topTabs];

  // Second row: the main groups (L1Des) inside the chosen top tab.
  const subTabs =
    isLive && category !== "All dishes"
      ? Array.from(
          new Set(
            items
              .filter((dish) => labelOf(dish) === category)
              .map((dish) => dish.group || "")
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b))
      : [];

  const query = search.trim().toLocaleLowerCase();
  const visible = items.filter(
    (dish) =>
      (category === "All dishes" || labelOf(dish) === category) &&
      (!subCategory || dish.group === subCategory) &&
      `${dish.name} ${dish.description} ${dish.category} ${dish.group ?? ""} ${dish.subGroup ?? ""}`.toLocaleLowerCase().includes(query),
  );

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
                setSubCategory("");
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
              }}>
                {filter}<span>{filter === "All dishes" ? items.length : items.filter((dish) => labelOf(dish) === filter).length}</span>
              </button>
            ))}
          </div>
        </div>

        {subTabs.length > 1 && (
          <div className="wm-subcat-panel" role="group" aria-label={`${category} sub categories`}>
            <p className="eyebrow">Browse {category.toLowerCase()}</p>
            <div className="wm-subcat-list">
              <button type="button" aria-pressed={subCategory === ""} onClick={() => setSubCategory("")}>
                All {category.toLowerCase()}<span>{items.filter((dish) => labelOf(dish) === category).length}</span>
              </button>
              {subTabs.map((sub) => (
                <button key={sub} type="button" aria-pressed={subCategory === sub} onClick={(event) => {
                  setSubCategory(sub);
                  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }}>
                  {sub}<span>{items.filter((dish) => labelOf(dish) === category && dish.group === sub).length}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="wm-catalog-top">
          <div><h2 id="menu-catalog-heading">Little favourites. Island flavour.</h2><p role="status">{visible.length} {visible.length === 1 ? "dish" : "dishes"}{subCategory ? ` in ${subCategory}` : category !== "All dishes" ? ` in ${category}` : ""}{showPrices ? "" : " · prices to be confirmed"}</p></div>
          <label className="wm-search">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.5" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5" /></svg>
            <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search dishes" placeholder="Find your favourite…" autoComplete="off" />
            {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); searchRef.current?.focus(); }}>×</button>}
          </label>
        </div>

        <div className="wm-dish-grid">
          {visible.map((dish) => (
            <article className="wm-dish-card" key={dish.id}>
              <div className="wm-dish-photo">
                <Image width={1200} height={900} src={dish.image} alt={dish.alt} sizes="(max-width: 767px) 50vw, (max-width: 1024px) 45vw, 30vw" loading="lazy" unoptimized={dish.image.startsWith("/api/")} />
                <span className="wm-dish-num">{String(items.indexOf(dish) + 1).padStart(2, "0")} / {dish.group || labelOf(dish)}</span>
              </div>
              <div className="wm-dish-info">
                <span className="eyebrow">{dish.subGroup || dish.note}</span>
                <h3>{dish.name}</h3>
                <p>{dish.description}</p>
                <div className="wm-dish-bottom"><span>{dish.price ? `LKR ${dish.price.toLocaleString("en-US")}` : "Price to confirm"}</span><button className="wm-dish-open" onClick={() => onDish(dish)} aria-label={`View ${dish.name}`}><MenuArrow /></button></div>
              </div>
            </article>
          ))}
        </div>
        {visible.length === 0 && <div className="wm-empty"><h3>A little different, perhaps?</h3><p>No dishes match this search. Try another word or category.</p><button className="button button-dark" onClick={() => { setCategory("All dishes"); setSearch(""); searchRef.current?.focus(); }}>Show the full menu <MenuArrow /></button></div>}
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
