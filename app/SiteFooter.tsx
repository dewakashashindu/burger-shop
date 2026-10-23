"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const INFO = {
  groups: {
    title: "Good company, always.",
    text: "Planning a meal with a group? Please confirm availability and arrangements with the restaurant. Group-booking options and contact details have not been supplied yet.",
  },
  dietary: {
    title: "A little care goes a long way.",
    text: "Please speak to the restaurant about allergies and dietary requirements before ordering. The menu is not an allergen guide, and this website does not guarantee that dishes are free from allergens or cross-contact.",
  },
  ingredients: {
    title: "The simple things, done with care.",
    text: "The dishes shown are menu ideas. Please confirm current ingredients, sourcing and availability with the restaurant before ordering.",
  },
  photos: {
    title: "A little restaurant atmosphere.",
    text: "Photography on this website is AI-generated concept imagery. It is not verified photography of the restaurant, its team or its dishes.",
  },
  privacy: {
    title: "A thoughtful visit.",
    text: "Reservations and orders on this website stay in your browser tab — nothing is submitted and no table, room or payment is reserved. Please avoid sensitive information in notes. Fonts may load from an external font provider; your browser contacts that provider. The restaurant’s final privacy policy must be confirmed before launch.",
  },
} as const;

type InfoKey = keyof typeof INFO;

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Sprig() {
  return (
    <svg width="72" height="84" viewBox="0 0 72 84" fill="none" aria-hidden="true">
      <path
        d="M28 76c3-20 10-40 24-62M37 49C17 49 14 33 15 24c17 4 25 11 22 25ZM44 35c-4-18 4-29 17-30 2 15-3 27-17 30ZM32 63C14 67 5 58 3 46c16-1 25 5 29 17ZM40 48c17-9 27-5 29 1-9 11-20 12-29 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The approved Warm Dining footer, reused on the reservation and order pages. */
export default function SiteFooter() {
  const [info, setInfo] = useState<InfoKey | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useCallback(() => setInfo(null), []);
  const year = useSyncExternalStore(
    () => () => {},
    () => new Date().getFullYear(),
    () => 2026,
  );
  useEffect(() => {
    if (!info) return;
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button, a")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      opener.current?.focus();
    };
  }, [info, close]);

  return (
    <>
      <footer id="footer" role="contentinfo" className="dining-footer site-footer" aria-label="MicroEChef footer">
        <div className="dining-footer__stage" aria-hidden="true">
          <div className="dining-footer__ambience">
            <Image
              width={1376}
              height={768}
              sizes="100vw"
              src="/images/restaurant.jpg"
              alt=""
              loading="lazy"
              className="dining-footer__image"
            />
          </div>
        </div>
        <div className="dining-footer__fog" aria-hidden="true" />
        <div className="dining-footer__content">
          <div className="dining-brand">
            <Link className="dining-brand__logo" href="/" aria-label="MicroEChef home">
              <span className="dining-brand__mark" aria-hidden="true">m</span>
              <span>MicroEChef</span>
            </Link>
            <h2>Good food. Good company.</h2>
            <p className="dining-brand__text">
              A little kitchen for slow lunches, warm welcomes, and the people who make every meal a
              little more special. Pull up a chair. There’s always room for you.
            </p>
            <Link className="dining-brand__cta" href="/auth/login">
              Find your table <Arrow />
            </Link>
            <p className="dining-brand__copyright">© {year} MicroEChef. Freshly made. Happily shared.</p>
            <p className="dining-brand__care">
              <Sprig /> Made with care. Meant to be shared.
            </p>
            <div className="dining-brand__chips" aria-label="Our little pleasures">
              <span><i aria-hidden="true" /> Fresh flavours</span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" stroke="currentColor" strokeWidth="1.5" />
                </svg>{" "}
                Made with care
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" stroke="currentColor" strokeWidth="1.5" />
                </svg>{" "}
                Good company
              </span>
            </div>
          </div>
          <nav className="dining-col" aria-label="Explore">
            <h3>Explore</h3>
            <ul>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/#kitchen">Our kitchen</Link></li>
              <li><Link href="/our-story">Our story</Link></li>
              <li><Link href="/menu">The menu</Link></li>
            </ul>
          </nav>
          <nav className="dining-col" aria-label="Your visit">
            <h3>Your visit</h3>
            <ul>
              <li><Link href="/auth/login">Book a table</Link></li>
              <li><button onClick={() => setInfo("groups")}>Groups</button></li>
              <li><button onClick={() => setInfo("dietary")}>Dietary needs</button></li>
              <li><button onClick={() => setInfo("groups")}>Contact</button></li>
            </ul>
          </nav>
          <nav className="dining-col" aria-label="Good to know">
            <h3>Good to know</h3>
            <ul>
              <li><button onClick={() => setInfo("ingredients")}>Ingredients</button></li>
              <li><button onClick={() => setInfo("photos")}>Food photos</button></li>
              <li><button onClick={() => setInfo("privacy")}>Privacy</button></li>
              <li>
                <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button>
              </li>
            </ul>
          </nav>
        </div>
        <p className="dining-footer__powered">powered by microechef</p>
      </footer>
      {info && (
        <div
          className="dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div ref={panel} className="dialog" role="dialog" aria-modal="true" aria-labelledby="footer-info-title">
            <div className="dialog-header">
              <h2 id="footer-info-title">{INFO[info].title}</h2>
              <button className="close-button" onClick={close} aria-label="Close dialog">✕</button>
            </div>
            <p>{INFO[info].text}</p>
            <button className="button button-dark" onClick={close}>Close <Arrow /></button>
          </div>
        </div>
      )}
    </>
  );
}
