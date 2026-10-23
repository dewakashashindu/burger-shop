"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MENU_CATEGORIES,
  isMenuCategory,
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
  useEffect(() => { onCategory(isMenuCategory(requested) ? requested : "All dishes"); }, [requested, onCategory]);
  return null;
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
  const [category, setCategory] = useState<MenuFilter>(initialCategory);
  const [search, setSearch] = useState("");
  const applyURLCategory = useCallback((value: MenuFilter) => setCategory(value), []);
  const searchRef = useRef<HTMLInputElement>(null);
  const filters: MenuFilter[] = ["All dishes", ...MENU_CATEGORIES];
  const query = search.trim().toLocaleLowerCase();
  const visible = SRI_LANKAN_MENU.filter(
    (dish) =>
      (category === "All dishes" || dish.category === category) &&
      `${dish.name} ${dish.description} ${dish.category}`.toLocaleLowerCase().includes(query),
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
        <button className="wm-hero-media" onClick={() => onDish(SRI_LANKAN_MENU[0])} aria-label="View featured Rice & curry">
          <Image width={1200} height={900} src={SRI_LANKAN_MENU[0].image} alt={SRI_LANKAN_MENU[0].alt} sizes="(max-width: 767px) 100vw, 50vw" loading="eager" fetchPriority="high" />
          <span className="wm-hero-label"><span><b>A plate of home.</b><small>RICE &amp; CURRY / FROM OUR KITCHEN</small></span><MenuArrow /></span>
        </button>
      </section>

      <section className="wm-catalog wm-wrap" id="menu-catalog" aria-labelledby="menu-catalog-heading">
        <div className="wm-category-panel">
          <p className="eyebrow">Explore the menu</p>
          <div className="wm-category-list" role="group" aria-label="Filter menu by category">
            {filters.map((filter) => (
              <button key={filter} type="button" aria-pressed={category === filter} onClick={(event) => {
                setCategory(filter);
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
              }}>
                {filter}<span>{filter === "All dishes" ? SRI_LANKAN_MENU.length : SRI_LANKAN_MENU.filter((dish) => dish.category === filter).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="wm-catalog-top">
          <div><h2 id="menu-catalog-heading">Little favourites. Island flavour.</h2><p role="status">{visible.length} {visible.length === 1 ? "dish" : "dishes"} · prices to be confirmed</p></div>
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
                <Image width={1200} height={900} src={dish.image} alt={dish.alt} sizes="(max-width: 767px) 50vw, (max-width: 1024px) 45vw, 30vw" loading="lazy" />
                <span className="wm-dish-num">{String(SRI_LANKAN_MENU.indexOf(dish) + 1).padStart(2, "0")} / {dish.category}</span>
              </div>
              <div className="wm-dish-info">
                <span className="eyebrow">{dish.note}</span>
                <h3>{dish.name}</h3>
                <p>{dish.description}</p>
                <div className="wm-dish-bottom"><span>Price to confirm</span><button className="wm-dish-open" onClick={() => onDish(dish)} aria-label={`View ${dish.name}`}><MenuArrow /></button></div>
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
      <Image width={1200} height={900} src={dish.image} alt={dish.alt} sizes="(max-width: 767px) 100vw, 40vw" />
      <div><span className="eyebrow">{dish.category}</span><h3>{dish.note}</h3><p>{dish.detail}</p><b>Price to be confirmed</b><div className="wm-dish-notice">Please confirm the recipe, portion, availability and all allergen or dietary information with the restaurant before ordering. This is not an allergen guide.</div></div>
    </div>
  );
}
