"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthScreen, { type AuthStage } from "./auth/AuthScreen";
import BookingFlow from "./reserve/BookingFlow";
import SiteFooter from "./SiteFooter";
import MenuContent, { MenuDishDetails } from "./menu/MenuContent";
import { MENU_CATEGORIES, type MenuCategory, type MenuDish, type MenuFilter } from "./menu-data";
import { mountStoryMotion } from "./story-motion";
import OrderPill from "./OrderPill";
import SignInFab from "./SignInFab";
import MotionBoot from "./MotionBoot";
import ContactContent from "./ContactContent";
import HeroClip from "./HeroClip";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

// Owner setup: replace the menu below and these details before going live.
// Leave unknown values empty: the website will never invent contact information.
const RESTAURANT = {
  name: "Mila Mirissā",
  email: "hello.milamirissa@gmail.com",
  // Every number the restaurant answers on, in the order they should be tried.
  phones: ["0772336233", "0771096131"],
};
const IMAGE = {
  restaurant: `/images/restaurant.jpg`,
  table: `/images/table.jpg`,
  signature: `/images/chicken-kottu.jpg`,
  chef: `/images/chef.jpg`,
  dessert: `/images/watalappan.jpg`,
};
const categories = MENU_CATEGORIES;
type Category = MenuCategory;
type Modal =
  | "dish"
  | "booking"
  | "visit"
  | "story"
  | "footerInfo"
  | "storyDetails"
  | null;
const STORY_INFO = {
  chef: {
    title: "The person behind the plate.",
    text: "The head chef’s name, background and cooking philosophy are being confirmed. The portrait is AI-generated concept imagery, not a photograph of the actual chef.",
  },
  branches: {
    title: "Other locations.",
    text: "No additional restaurant locations have been confirmed. This section is reserved for verified branches; no extra branches or addresses are being claimed.",
  },
} as const;
const FOOTER_INFO = {
  groups: {
    title: "Good company, always.",
    text: "Planning a meal with a group? Please confirm availability and arrangements with the restaurant. Group-booking options and contact details have not been supplied yet.",
  },
  dietary: {
    title: "A little care goes a long way.",
    text: "Please speak to the restaurant about allergies and dietary requirements before ordering. This menu is not an allergen guide, and this website does not guarantee that dishes are free from allergens or cross-contact.",
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
    text: "The reservation planner saves your request draft in this browser only. Nothing is submitted and no table is reserved. Use “Clear draft & personal details” in the planner to delete it. Please avoid sensitive information in your notes. Fonts may load from an external font provider; your browser contacts that provider. The restaurant’s final privacy policy must be confirmed before launch.",
  },
} as const;

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 19 19 5M5 5h14v14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Sprig({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="72"
      height="84"
      viewBox="0 0 72 84"
      fill="none"
      aria-hidden="true"
    >
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
function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}
type RestaurantSection = "home" | "kitchen" | "story";
function isRestaurantSection(
  value: string | undefined,
): value is RestaurantSection {
  return value === "home" || value === "kitchen" || value === "story";
}
const SECTION_IDS: RestaurantSection[] = ["home", "kitchen", "story"];

/** Smooth-scroll to a section of the homepage, landing clear of the fixed header. */
function navigateSection(id: RestaurantSection, behavior?: ScrollBehavior) {
  const target = document.getElementById(id);
  if (!target) return false;
  const navH = document.querySelector<HTMLElement>(".navbar")?.offsetHeight ?? 0;
  const top =
    id === "home"
      ? 0
      : target.getBoundingClientRect().top + window.scrollY - navH;
  window.scrollTo({ top: Math.max(0, top), behavior: behavior ?? "smooth" });
  try {
    window.history.replaceState(null, "", `#${id}`);
  } catch {
    /* Sandboxed offline previews cannot always edit history. */
  }
  return true;
}

/** The landing hero, drawn from the approved sketch.
 *
 * The clip fills the screen and the words ride in a cream card laid over it.
 * One custom property, --vc-p (0 → 1), is written from inside a rAF: the card
 * fades out and lifts as the guest scrolls, which leaves the clip on its own
 * before the cream part of the page rises over it (that part is the sticky
 * hero holding still while the next section carries a gap as its margin-top).
 * With JavaScript off, or with reduced motion, the card simply stays put.
 */
function useHeroCardFade(heroRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    let raf = 0;

    const paint = () => {
      raf = 0;
      // The card is gone by the time the guest has scrolled just under half a
      // screen, which leaves the rest of the pin showing the clip alone.
      const span = Math.max(1, window.innerHeight * 0.42);
      const progress = clamp(window.scrollY / span);
      hero.style.setProperty("--vc-p", progress.toFixed(4));
      hero.classList.toggle("vc-cleared", progress > 0.999);
    };
    const request = () => {
      if (!raf) raf = window.requestAnimationFrame(paint);
    };

    let running = false;
    const stop = () => {
      if (!running) return;
      running = false;
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      hero.classList.remove("vc-cleared");
      hero.style.removeProperty("--vc-p");
    };
    const start = () => {
      stop();
      if (reduced.matches) return;
      running = true;
      paint();
      window.addEventListener("scroll", request, { passive: true });
      window.addEventListener("resize", request);
    };

    start();
    const onChange = () => start();
    reduced.addEventListener("change", onChange);
    return () => {
      reduced.removeEventListener("change", onChange);
      stop();
    };
  }, [heroRef]);
}

/** Keeps the header link of the section in view marked as current. */
function useSectionSpy(
  pageKey: string,
  onSectionChange: (id: RestaurantSection) => void,
) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && isRestaurantSection(entry.target.id))
            onSectionChange(entry.target.id);
        }
      },
      { rootMargin: "-42% 0px -52% 0px", threshold: 0 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pageKey, onSectionChange]);
}

type Position = { x: number; y: number; sw: number; sh: number };
function useMaskPositions(
  sectionRef: RefObject<HTMLDivElement | null>,
  cards: RefObject<(HTMLButtonElement | null)[]>,
) {
  const [positions, setPositions] = useState<Position[]>([]);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const update = () => {
      setPositions(
        (cards.current || []).map((card) => {
          let x = 0,
            y = 0;
          let el: HTMLElement | null = card;
          while (el && el !== section) {
            x += el.offsetLeft;
            y += el.offsetTop;
            el = el.offsetParent as HTMLElement | null;
          }
          return { x, y, sw: section.clientWidth, sh: section.clientHeight };
        }),
      );
    };
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(section);
    update();
    return () => observer?.disconnect();
  }, [sectionRef, cards]);
  return positions;
}
function useImageWidth(
  image: string,
  sectionRef: RefObject<HTMLDivElement | null>,
) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const img = new window.Image();
    let alive = true;
    const update = () => {
      if (alive && img.naturalHeight)
        setWidth(
          Math.max(
            section.clientWidth,
            (img.naturalWidth * section.clientHeight) / img.naturalHeight,
          ),
        );
    };
    img.onload = update;
    img.src = image;
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(section);
    return () => {
      alive = false;
      img.onload = null;
      observer?.disconnect();
    };
  }, [image, sectionRef]);
  return width;
}
function MaskedCard({
  position,
  imageWidth,
  focalX,
  cardRef,
  className = "",
  children,
  onClick,
}: {
  position?: Position;
  imageWidth: number;
  focalX: number;
  cardRef: (el: HTMLButtonElement | null) => void;
  className?: string;
  children: ReactNode;
  onClick: () => void;
}) {
  const offset = position ? Math.max(0, imageWidth - position.sw) * focalX : 0;
  const style: CSSProperties =
    position && imageWidth
      ? {
          backgroundImage: `url(${IMAGE.table})`,
          backgroundSize: `${imageWidth}px auto`,
          backgroundPosition: `-${position.x + offset}px -${position.y}px`,
        }
      : { backgroundImage: `url(${IMAGE.table})`, backgroundSize: "cover" };
  return (
    <button
      ref={cardRef}
      className={`masked-card ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex="0"]',
    );
    first?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input, select, textarea, [tabindex="0"]',
        ),
      ).filter((el) => el.getClientRects().length);
      const firstEl = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        firstEl?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`dialog ${wide ? "dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function BookingForm() {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => {
    const empty = {
      name: "",
      email: "",
      date: "",
      time: "19:00",
      guests: "2",
      notes: "",
    };
    try {
      return {
        ...empty,
        ...JSON.parse(localStorage.getItem("microechef-booking-draft") || "{}"),
      };
    } catch {
      return empty;
    }
  });
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const update = (key: keyof typeof form, value: string) => {
    setForm({ ...form, [key]: value });
    setSaved(false);
    setError("");
  };
  const summary = `Mila Mirissa — reservation request draft\n\nName: ${form.name}\nEmail: ${form.email}\nDate: ${form.date}\nPreferred time: ${form.time}\nGuests: ${form.guests}\nNotes: ${form.notes || "None"}\n\nThis is a draft only. It has NOT been sent, and no table has been reserved. Please contact the restaurant to confirm availability.\n`;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([summary], { type: "text/plain" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "mila-mirissa-reservation-draft.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <p className="dialog-intro">
        Something to look forward to. Plan a meal with your favourite people.
      </p>
      <div className="notice">
        <strong>Reservation planner — not a confirmed booking.</strong> Online
        booking is not connected yet. Save a request on this device; nothing is
        sent to the restaurant.
      </div>
      <form
        className="booking-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.date < minDate) {
            setError("Please choose today or a future date.");
            return;
          }
          try {
            localStorage.setItem(
              "microechef-booking-draft",
              JSON.stringify(form),
            );
            setSaved(true);
            setError("");
          } catch {
            setError(
              "Your browser could not save the draft. Please allow local storage and try again.",
            );
          }
        }}
      >
        <div className="form-grid">
          <label>
            Your name
            <input
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              maxLength={100}
              placeholder="How should we call you?"
            />
          </label>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Preferred date
            <input
              name="date"
              type="date"
              min={minDate}
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              required
            />
          </label>
          <label>
            Preferred time
            <input
              name="time"
              type="time"
              value={form.time}
              onChange={(e) => update("time", e.target.value)}
              required
            />
          </label>
          <label>
            People at your table
            <select
              name="guests"
              value={form.guests}
              onChange={(e) => update("guests", e.target.value)}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "guest" : "guests"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          A little note <span className="optional">(optional)</span>
          <textarea
            name="notes"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="An occasion, a question, or anything we should know…"
          />
        </label>
        <p className="privacy-note">
          Drafts stay in this browser. Please do not include sensitive
          information. Preferred times are not a statement of opening hours.
        </p>
        <button type="submit" className="button button-dark w-full">
          Save my request draft <Arrow />
        </button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {saved && (
          <div className="saved-message" role="status">
            <strong>Your draft is saved on this device.</strong>
            <p>No request was sent and no table has been reserved.</p>
            <button className="text-link" type="button" onClick={download}>
              Download the request as a text file <Arrow />
            </button>
            {RESTAURANT.email && (
              <Link
                className="text-link"
                href={`mailto:${RESTAURANT.email}?subject=${encodeURIComponent("Reservation request")}&body=${encodeURIComponent(summary)}`}
              >
                Open an email request <Arrow />
              </Link>
            )}
          </div>
        )}
        <button
          className="clear-draft"
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem("microechef-booking-draft");
            } catch {
              /* Browser storage may be disabled. */
            }
            setForm({
              name: "",
              email: "",
              date: "",
              time: "19:00",
              guests: "2",
              notes: "",
            });
            setSaved(false);
            setError("");
          }}
        >
          Clear draft & personal details
        </button>
      </form>
    </>
  );
}

function OurStoryContent({
  onInfo,
  onBooking,
  onLocation,
}: {
  onInfo: (key: keyof typeof STORY_INFO) => void;
  onBooking: () => void;
  onLocation: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = contentRef.current?.closest<HTMLElement>(".story-page-shell");
    if (!shell) return;
    return mountStoryMotion(shell);
  }, []);
  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest<HTMLElement>("[data-info]");
    if (action) {
      event.preventDefault();
      const key = action.dataset.info;
      if (key === "booking") onBooking();
      else if (key === "location") onLocation();
      else if (key === "chef" || key === "branches") onInfo(key);
      return;
    }
    const jump = event.target.closest<HTMLElement>("[data-jump]");
    if (jump) {
      const target = document.getElementById(`${jump.dataset.jump}-3`);
      target?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  };
  return (
    <div className="story-content" ref={contentRef} onClick={handleClick}>
      <div className="studio motion-studio">
        <div className="motion-brand">
          <b>OUR STORY</b>
          <small>Mila Mirissa · Place &amp; Visit</small>
        </div>
        <div className="motion-progress" aria-hidden="true" />
      </div>
      <div className="page place" id="story-page-content">
        <section className="hero hero-place cinematic-hero">
          <div className="hero-stage">
            <div className="hero-image-frame">
              <figure className="place-photo">
                <Image
                  alt="Illustrative cream and olive restaurant interior"
                  loading="eager"
                  src="/images/restaurant.jpg"
                  width="1376"
                  height="768"
                  sizes="100vw"
                />
              </figure>
            </div>
            <div aria-hidden="true" className="hero-shade"></div>
            <div aria-hidden="true" className="hero-wash"></div>
            <div className="place-card">
              <div className="card-surface">
                <span
                  className="eyebrow intro-piece"
                  style={{ "--entry-delay": "350ms" } as CSSProperties}
                >
                  {"Our story / A place to feel at home"}
                </span>
                <h1 aria-label="Your table. Your little pause.">
                  <span className="line-mask">
                    <span
                      className="line-ink"
                      style={{ "--line": "0" } as CSSProperties}
                    >
                      {"Your table."}
                    </span>
                  </span>
                  <span className="line-mask">
                    <span
                      className="line-ink"
                      style={{ "--line": "1" } as CSSProperties}
                    >
                      {"Your "}
                      <em>{"little pause."}</em>
                    </span>
                  </span>
                </h1>
                <p
                  className="intro-piece"
                  style={{ "--entry-delay": "460ms" } as CSSProperties}
                >
                  {"Get to know Mila Mirissa."}
                  <br />
                  {"Then make yourself at home."}
                </p>
                <button
                  className="pill intro-piece"
                  data-jump="visit"
                  style={{ "--entry-delay": "570ms" } as CSSProperties}
                >
                  {"Plan your visit "}
                  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                    <path
                      d="M5 19 19 5M5 5h14v14"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.4"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>
            <div aria-hidden="true" className="hero-phrase">
              <span>{"GOOD FOOD. GOOD COMPANY."}</span>
              <p>
                {"A little pause."}
                <br />
                <em>{"A lovely place."}</em>
              </p>
              <small>{"MAKE YOURSELF AT HOME."}</small>
            </div>
            <div aria-hidden="true" className="hero-paper-copy">
              <span>{"A LITTLE PAUSE. A LOVELY MEAL."}</span>
              <p>
                {"A place to feel"}
                <br />
                <em>{"at home."}</em>
              </p>
              <small>{"THE STORY CONTINUES ↓"}</small>
            </div>
            <div aria-hidden="true" className="step-inside">
              <i></i>
              <span>{"SCROLL TO STEP INSIDE"}</span>
            </div>
            <div className="place-index">
              <button data-jump="intro">{"01 / Our story"}</button>
              <button data-jump="chef">{"02 / Our chef"}</button>
              <button data-jump="visit">{"03 / Hours & facilities"}</button>
              <button data-jump="locations">{"04 / Locations"}</button>
            </div>
          </div>
        </section>
        <section className="intro section wrap" id="intro-3">
          <div
            className="motion-reveal"
            style={{ "--reveal-delay": "0ms" } as CSSProperties}
          >
            <span className="eyebrow">{"01 / A little introduction"}</span>
            <h2 aria-label="A little kitchen. A lot of heart.">
              <span className="line-mask">
                <span
                  className="line-ink"
                  style={{ "--line": "0" } as CSSProperties}
                >
                  {"A little kitchen."}
                </span>
              </span>
              <span className="line-mask">
                <span
                  className="line-ink"
                  style={{ "--line": "1" } as CSSProperties}
                >
                  {"A lot of "}
                  <em>{"heart."}</em>
                </span>
              </span>
            </h2>
          </div>
          <div
            className="intro-copy motion-reveal"
            style={{ "--reveal-delay": "90ms" } as CSSProperties}
          >
            <p className="lead">
              <span className="read-word">{"A"}</span>{" "}
              <span className="read-word">{"place"}</span>{" "}
              <span className="read-word">{"for"}</span>{" "}
              <span className="read-word">{"familiar"}</span>{" "}
              <span className="read-word">{"flavours,"}</span>{" "}
              <span className="read-word">{"thoughtful"}</span>{" "}
              <span className="read-word">{"details,"}</span>{" "}
              <span className="read-word">{"and"}</span>{" "}
              <span className="read-word">{"the"}</span>{" "}
              <span className="read-word">{"people"}</span>{" "}
              <span className="read-word">{"who"}</span>{" "}
              <span className="read-word">{"make"}</span>{" "}
              <span className="read-word">{"a"}</span>{" "}
              <span className="read-word">{"meal"}</span>{" "}
              <span className="read-word">{"worth"}</span>{" "}
              <span className="read-word">{"remembering."}</span>
            </p>
            <p>
              {
                "Mila Mirissa is imagined as your neighbourhood pause. Pull up a chair for a slow lunch, a favourite bite, or a conversation that lasts a little longer. The idea is simple: good food should bring people together."
              }
            </p>
            <div className="values">
              <span>{"Thoughtfully made"}</span>
              <span>{"Happily shared"}</span>
              <span>{"Good company"}</span>
            </div>
            <p className="draft-note">
              {
                "Slow moments. Lovely meals. Good company."
              }
            </p>
          </div>
        </section>
        <section className="visit section wrap" id="visit-3">
          <article
            className="hours-card motion-reveal"
            id="hours-3"
            style={{ "--reveal-delay": "0ms" } as CSSProperties}
          >
            <span className="eyebrow">{"03 / Make a little time"}</span>
            <h2 aria-label="Come by. Stay a while.">
              <span className="line-mask">
                <span
                  className="line-ink"
                  style={{ "--line": "0" } as CSSProperties}
                >
                  {"Come by."}
                </span>
              </span>
              <span className="line-mask">
                <span
                  className="line-ink"
                  style={{ "--line": "1" } as CSSProperties}
                >
                  <em>{"Stay a while."}</em>
                </span>
              </span>
            </h2>
            <p>{"Opening hours"}</p>
            <dl>
              <div>
                <dt>{"Monday – Friday"}</dt>
                <dd>{"To be confirmed"}</dd>
              </div>
              <div>
                <dt>{"Saturday"}</dt>
                <dd>{"To be confirmed"}</dd>
              </div>
              <div>
                <dt>{"Sunday & holidays"}</dt>
                <dd>{"To be confirmed"}</dd>
              </div>
            </dl>
            <p className="draft-note">
              {
                "No opening times have been supplied yet. Confirm service hours before planning a visit."
              }
            </p>
            <button className="pill" data-info="booking">
              {"Plan a visit "}
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path
                  d="M5 19 19 5M5 5h14v14"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.4"
                ></path>
              </svg>
            </button>
          </article>
          <article
            className="facilities-card motion-reveal"
            id="facilities-3"
            style={{ "--reveal-delay": "0ms" } as CSSProperties}
          >
            <span className="eyebrow">{"04 / The little comforts"}</span>
            <h2 aria-label="A space that feels like you.">
              <span className="line-mask">
                <span
                  className="line-ink"
                  style={{ "--line": "0" } as CSSProperties}
                >
                  {"A space that"}
                </span>
              </span>
              <span className="line-mask">
                <span
                  className="line-ink"
                  style={{ "--line": "1" } as CSSProperties}
                >
                  {"feels "}
                  <em>{"like you."}</em>
                </span>
              </span>
            </h2>
            <p>{"Facilities & guest needs"}</p>
            <ul className="facility-list">
              <li style={{ "--item-delay": "0ms" } as CSSProperties}>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M3 4v6m3-6v6M3 7h3m-1 3v11M15 3v18m0-18c6 3 6 8 0 9"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.4"
                  ></path>
                </svg>
                <span>
                  <b>{"Dining"}</b>
                  <small>{"To be confirmed"}</small>
                </span>
              </li>
              <li style={{ "--item-delay": "75ms" } as CSSProperties}>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.4"
                  ></path>
                </svg>
                <span>
                  <b>{"Groups"}</b>
                  <small>{"To be confirmed"}</small>
                </span>
              </li>
              <li style={{ "--item-delay": "150ms" } as CSSProperties}>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M6 21V3h7a5 5 0 0 1 0 10H6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.4"
                  ></path>
                </svg>
                <span>
                  <b>{"Parking"}</b>
                  <small>{"To be confirmed"}</small>
                </span>
              </li>
              <li style={{ "--item-delay": "225ms" } as CSSProperties}>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h.01"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.4"
                  ></path>
                </svg>
                <span>
                  <b>{"Wi-Fi"}</b>
                  <small>{"To be confirmed"}</small>
                </span>
              </li>
              <li style={{ "--item-delay": "300ms" } as CSSProperties}>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M12 7v8h6l3 6M12 11H7m3 3a5 5 0 1 0 6 5M13 3h.01"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.4"
                  ></path>
                </svg>
                <span>
                  <b>{"Accessibility"}</b>
                  <small>{"To be confirmed"}</small>
                </span>
              </li>
              <li style={{ "--item-delay": "375ms" } as CSSProperties}>
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M5 20c1-8 5-12 14-16 1 10-4 16-12 14m-2 2L15 9"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.4"
                  ></path>
                </svg>
                <span>
                  <b>{"Dietary care"}</b>
                  <small>{"To be confirmed"}</small>
                </span>
              </li>
            </ul>
            <p className="draft-note">
              {
                "Suggested categories only — these are not confirmed facilities. Accessibility and dietary arrangements must be checked with the restaurant."
              }
            </p>
          </article>
        </section>
        <section className="chef section wrap" id="chef-3">
          <div className="chef-art">
            <figure className="chef-photo">
              <Image
                alt="AI-generated fictional chef portrait, not the actual Mila Mirissa chef"
                loading="lazy"
                src="/images/chef-portrait.jpg"
                width="900"
                height="1100"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
            </figure>
            <div aria-hidden="true" className="chef-seal">
              <svg viewBox="0 0 120 120">
                <defs>
                  <path
                    d="M60,60 m-43,0 a43,43 0 1,1 86,0 a43,43 0 1,1 -86,0"
                    id="care-circle"
                  ></path>
                </defs>
                <circle
                  cx="60"
                  cy="60"
                  fill="#f5f1e9"
                  r="57"
                  stroke="#8b9b7655"
                ></circle>
                <text>
                  <textPath href="#care-circle">
                    {"MADE WITH CARE · MEANT TO BE SHARED · "}
                  </textPath>
                </text>
                <path
                  d="M46 78c3-17 10-30 24-39M52 65c-16-1-18-11-17-18 13 3 20 8 17 18Zm8-11c-2-13 5-20 14-21 1 11-4 19-14 21Zm-5 15c12-7 20-4 22 1-7 8-15 9-22 5"
                  fill="none"
                  stroke="#8c6539"
                  strokeWidth="1.1"
                ></path>
              </svg>
            </div>
          </div>
          <div
            className="chef-copy motion-reveal"
            style={{ "--reveal-delay": "0ms" } as CSSProperties}
          >
            <span className="eyebrow">
              {"02 / The person behind the plate"}
            </span>
            <h2 aria-label="Good food starts with good hands.">
              <span className="line-mask">
                <span
                  className="line-ink"
                  style={{ "--line": "0" } as CSSProperties}
                >
                  {"Good food starts"}
                </span>
              </span>
              <span className="line-mask">
                <span
                  className="line-ink"
                  style={{ "--line": "1" } as CSSProperties}
                >
                  {"with "}
                  <em>{"good hands."}</em>
                </span>
              </span>
            </h2>
            <div className="chef-id">
              <b>{"Your head chef"}</b>
              <span>{"Name & role to be confirmed"}</span>
            </div>
            <p>
              {
                "Meet the person who brings the kitchen’s ideas to the table. This space is for their real background, cooking philosophy, favourite ingredients, and the little details they care about."
              }
            </p>
            <blockquote>
              {"“The simple things, done with care.”"}
              <small>
                {"Our kitchen philosophy."}
              </small>
            </blockquote>
            <button className="text-link" data-info="chef">
              {"A little more about the chef "}
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path
                  d="M5 19 19 5M5 5h14v14"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.4"
                ></path>
              </svg>
            </button>
          </div>
        </section>
        <section className="locations section wrap" id="locations-3">
          <div className="section-heading">
            <div
              className="motion-reveal"
              style={{ "--reveal-delay": "0ms" } as CSSProperties}
            >
              <span className="eyebrow">{"05 / Find your kind of place"}</span>
              <h2 aria-label="Same welcome. Every table.">
                <span className="line-mask">
                  <span
                    className="line-ink"
                    style={{ "--line": "0" } as CSSProperties}
                  >
                    {"Same welcome."}
                  </span>
                </span>
                <span className="line-mask">
                  <span
                    className="line-ink"
                    style={{ "--line": "1" } as CSSProperties}
                  >
                    <em>{"Every table."}</em>
                  </span>
                </span>
              </h2>
            </div>
            <p
              className="motion-reveal"
              style={{ "--reveal-delay": "0ms" } as CSSProperties}
            >
              {"Restaurant & other locations"}
              <br />
              <span className="draft-note">
                {"Location details are not yet confirmed."}
              </span>
            </p>
          </div>
          <div className="location-grid">
            <article
              className="location-card motion-reveal"
              style={{ "--reveal-delay": "0ms" } as CSSProperties}
            >
              <figure className="location-photo">
                <Image
                  alt="Illustrative cream and olive restaurant interior"
                  loading="lazy"
                  src="/images/restaurant.jpg"
                  width="1376"
                  height="768"
                  sizes="100vw"
                />
              </figure>
              <div className="location-copy">
                <span className="eyebrow">
                  {"Location 01 / Details pending"}
                </span>
                <h3>{"The main restaurant"}</h3>
                <p>
                  {
                    "Restaurant address, contact details and opening date will appear here once confirmed."
                  }
                </p>
                <button className="text-link" data-info="location">
                  {"Location details "}
                  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                    <path
                      d="M5 19 19 5M5 5h14v14"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.4"
                    ></path>
                  </svg>
                </button>
              </div>
            </article>
            <article
              className="location-card future-location motion-reveal"
              style={{ "--reveal-delay": "90ms" } as CSSProperties}
            >
              <div className="future-art">
                <svg aria-hidden="true" fill="none" viewBox="0 0 160 160">
                  <path
                    d="M80 133S39 94 39 62a41 41 0 0 1 82 0c0 32-41 71-41 71Z"
                    stroke="currentColor"
                  ></path>
                  <circle cx="80" cy="62" r="14" stroke="currentColor"></circle>
                  <path d="M24 139h112M13 146h134" stroke="currentColor"></path>
                </svg>
                <span>{"Room for another story."}</span>
              </div>
              <div className="location-copy">
                <span className="eyebrow">
                  {"Other locations / Optional section"}
                </span>
                <h3>{"More places, same welcome."}</h3>
                <p>
                  {
                    "Reserved for confirmed branches. No additional locations have been supplied or are being claimed."
                  }
                </p>
                <button className="text-link" data-info="branches">
                  {"About other locations "}
                  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                    <path
                      d="M5 19 19 5M5 5h14v14"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.4"
                    ></path>
                  </svg>
                </button>
              </div>
            </article>
          </div>
        </section>
        <section
          className="closer wrap motion-reveal"
          style={{ "--reveal-delay": "0ms" } as CSSProperties}
        >
          <span className="eyebrow">{"A little pause. A lovely meal."}</span>
          <h2 aria-label="There’s always room for good company.">
            <span className="line-mask">
              <span
                className="line-ink"
                style={{ "--line": "0" } as CSSProperties}
              >
                {"There’s always room"}
              </span>
            </span>
            <span className="line-mask">
              <span
                className="line-ink"
                style={{ "--line": "1" } as CSSProperties}
              >
                {"for "}
                <em>{"good company."}</em>
              </span>
            </span>
          </h2>
          <button className="pill" data-info="booking">
            {"Find your table "}
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path
                d="M5 19 19 5M5 5h14v14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.4"
              ></path>
            </svg>
          </button>
        </section>
      </div>
    </div>
  );
}

export default function App({ storyPage = false, menuPage = false, contactPage = false, initialMenuCategory = "All dishes", authPage, reservePage = false, orderPage = false, startView }: { storyPage?: boolean; menuPage?: boolean; contactPage?: boolean; initialMenuCategory?: MenuFilter; authPage?: AuthStage; reservePage?: boolean; orderPage?: boolean; startView?: "reserve" }) {
  const router = useRouter();
  const [selectedDish, setSelectedDish] = useState<MenuDish | null>(null);
  const [storyDetail, setStoryDetail] =
    useState<keyof typeof STORY_INFO>("chef");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [footerInfo, setFooterInfo] =
    useState<keyof typeof FOOTER_INFO>("photos");
  const homePage = !storyPage && !menuPage && !contactPage;
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState(
    menuPage ? "menu" : storyPage ? "story" : "home",
  );
  const copyrightYear = useSyncExternalStore(
    () => () => {},
    () => new Date().getFullYear(),
    () => 2026,
  );
  const mobile = useIsMobile();
  const closeModal = useCallback(() => setModal(null), []);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const pageKey = contactPage
    ? "contact"
    : menuPage
      ? "menu"
      : storyPage
        ? "story"
        : "home";
  useHeroCardFade(heroRef);
  useSectionSpy(pageKey, setActiveSection);
  const mosaicRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const maskPositions = useMaskPositions(mosaicRef, cardRefs);
  const imageWidth = useImageWidth(IMAGE.table, mosaicRef);
  const open = (value: Modal) => {
    setMobileMenu(false);
    if (value === "booking") {
      // Straight to "A table, or a room?" — the reservation itself. Signing in
      // happens at the end, when the guest confirms, never on the way in.
      setModal(null);
      router.push("/reserve?view=reserve");
      return;
    }
    setModal(value);
  };
  const openMenu = (value?: Category) => {
    setMobileMenu(false);
    router.push(value ? `/menu?category=${encodeURIComponent(value)}` : "/menu");
  };
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = mobileMenu || modal ? "hidden" : "";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenu, modal]);
  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 20);
      // The hero stays pinned behind the next section, so it never stops
      // intersecting — on the way back up nothing would re-light "Home".
      if (homePage && window.scrollY < 40)
        setActiveSection((current) => (current === "home" ? current : "home"));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [homePage]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const closeOnDesktop = () => {
      if (!query.matches) setMobileMenu(false);
    };
    query.addEventListener("change", closeOnDesktop);
    return () => query.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!mobileMenu) return;
    const first = menuPanelRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenu(false);
        menuToggleRef.current?.focus();
      }
      if (e.key !== "Tab") return;
      const elements = [
        menuToggleRef.current,
        ...Array.from(
          menuPanelRef.current?.querySelectorAll<HTMLElement>("a,button") || [],
        ),
      ].filter(Boolean) as HTMLElement[];
      const firstEl = elements[0],
        last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileMenu]);
  const navLinks = [
    { label: "Home", id: "home" },
    { label: "Our story", id: "story" },
  ] as const;
  const sectionHref = (id: RestaurantSection) => {
    if (id === "story") return "/our-story";
    // Only the homepage can scroll to a section. Everywhere else — the menu,
    // the story, Contact us — the brand and "Home" have to be a real link back
    // to "/", otherwise clicking the logo does nothing.
    if (!homePage) return id === "home" ? "/" : "/#kitchen";
    return `#${id}`;
  };
  const followSection = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    id: RestaurantSection,
  ) => {
    if (homePage && id !== "story" && navigateSection(id))
      event.preventDefault();
  };
  if (authPage)
    return (
      <div className="app-shell auth-page-shell">
        <MotionBoot />
        <Suspense fallback={null}>
          <AuthScreen key={authPage} stage={authPage} />
        </Suspense>
      </div>
    );
  if (reservePage || orderPage)
    return (
      <div className={`app-shell reserve-page-shell${orderPage ? " order-page-shell" : ""}`}>
        <MotionBoot />
        <BookingFlow key={orderPage ? "order" : "reserve"} start={orderPage ? "order" : startView === "reserve" ? "reserve" : "choose"} />
        <SiteFooter />
        <SignInFab />
      </div>
    );
  return (
    <div
      className={`app-shell${storyPage ? " story-page-shell" : ""}${menuPage ? " menu-page-shell" : ""}${homePage ? " video-hero-page" : ""}`}
    >
      <MotionBoot />
      <OrderPill />
      <SignInFab stacked />
      <Link className="skip-link" href="#main">
        Skip to content
      </Link>
      <header
        className={`navbar ${scrolled ? "scrolled" : ""} ${mobileMenu ? "menu-is-open" : ""}`}
      >
        <Link
          href={sectionHref("home")}
          className="brand"
          aria-label="Mila Mirissa home"
          onClick={(event) => {
            setMobileMenu(false);
            followSection(event, "home");
          }}
        >
          <Image className="brand__logo" src="/images/mila-mirissa-logo-sm.png" alt="" width={96} height={96} aria-hidden="true" priority />
          <span className="brand__text">Mila Mirissa<small>kitchen &amp; good company</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navLinks.slice(1).map((link) => (
            <Link
              key={link.id}
              className={activeSection === link.id ? "active" : ""}
              href={sectionHref(link.id)}
              onClick={(event) => {
                followSection(event, link.id);
              }}
              aria-current={activeSection === link.id ? "location" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/menu" className={menuPage ? "active" : ""} aria-current={menuPage ? "page" : undefined}>The menu</Link>
          <Link href="/contact" className={contactPage ? "active" : ""} aria-current={contactPage ? "page" : undefined} onClick={() => setMobileMenu(false)}>Contact us</Link>
          <button
            className="button button-outline"
            onClick={() => open("booking")}
          >
            Find your table <Arrow />
          </button>
        </nav>
        <button
          ref={menuToggleRef}
          className={`hamburger ${mobileMenu ? "is-open" : ""}`}
          onClick={() => setMobileMenu(!mobileMenu)}
          aria-label={mobileMenu ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileMenu}
          aria-controls="mobile-navigation"
        >
          <span />
          <span />
          <span />
        </button>
      </header>
      <div
        className={`mobile-menu ${mobileMenu ? "open" : ""}`}
        ref={(el) => {
          if (el) el.inert = !mobileMenu;
        }}
        aria-hidden={!mobileMenu}
      >
        <div
          className="menu-backdrop"
          onClick={() => {
            setMobileMenu(false);
            menuToggleRef.current?.focus();
          }}
        />
        <div className="mobile-panel" ref={menuPanelRef}>
          <nav id="mobile-navigation" aria-label="Mobile navigation">
            {navLinks.map((link, i) => (
              <Link
                style={{
                  transitionDelay: mobileMenu ? `${100 + i * 60}ms` : "0ms",
                }}
                key={link.id}
                href={sectionHref(link.id)}
                onClick={(event) => {
                  setMobileMenu(false);
                  followSection(event, link.id);
                }}
              >
                {link.label}
                <Arrow />
              </Link>
            ))}
            <Link
              href="/menu"
              onClick={() => setMobileMenu(false)}
              aria-current={menuPage ? "page" : undefined}
              style={{ transitionDelay: mobileMenu ? "280ms" : "0ms" }}
            >
              The menu
              <Arrow />
            </Link>
            <Link
              href="/contact"
              onClick={() => setMobileMenu(false)}
              aria-current={contactPage ? "page" : undefined}
              style={{ transitionDelay: mobileMenu ? "340ms" : "0ms" }}
            >
              Contact us
              <Arrow />
            </Link>
          </nav>
          <div className="mobile-menu-bottom">
            <span className="eyebrow">A little pause. A lovely meal.</span>
            <button
              className="button button-dark"
              onClick={() => open("booking")}
            >
              Find your table <Arrow />
            </button>
          </div>
        </div>
      </div>
      <main id="main">
        {contactPage ? (
          <ContactContent />
        ) : menuPage ? (
          <MenuContent initialCategory={initialMenuCategory} onBooking={() => open("booking")} onDish={(dish) => { setSelectedDish(dish); open("dish"); }} />
        ) : storyPage ? (
          <OurStoryContent
            onBooking={() => open("booking")}
            onLocation={() => router.push("/contact")}
            onInfo={(key) => {
              setStoryDetail(key);
              open("storyDetails");
            }}
          />
        ) : (
          <>
            <div className="vc-stage">
            <section id="home" ref={heroRef} className="hero-section vc-hero">
              <div className="vc-media">
                <Image
                  fill
                  sizes="100vw"
                  className="vc-still"
                  src={IMAGE.restaurant}
                  alt="A sunlit restaurant in Mirissa with oak tables, olive-green seating and soft linen curtains"
                  loading="eager"
                  fetchPriority="high"
                />
                <HeroClip
                  className="vc-clip"
                  src="/hero.mp4"
                  poster={IMAGE.restaurant}
                />
                <div className="vc-veil" aria-hidden="true" />
              </div>

              <div className="vc-card">
                <div className="eyebrow flex items-center gap-3">
                  <span className="tiny-line" /> A little pause. A lovely meal.
                </div>
                <h1>
                  Your kind
                  <br />
                  of <em>place.</em>
                  <span className="heading-period"> ✳</span>
                </h1>
                <p className="hero-description">
                  Pull up a chair. Settle into something delicious. At Mila
                  Mirissa, there’s always room for good food and even better
                  company.
                </p>
                <div className="hero-actions">
                  <button
                    className="button button-dark"
                    onClick={() => open("booking")}
                  >
                    Find your table <Arrow />
                  </button>
                  <button className="text-link" onClick={() => openMenu()}>
                    Explore the menu <span className="long-arrow">⟶</span>
                  </button>
                </div>
                <div className="vc-meta">
                  <span>Mirissa · Sri Lanka</span>
                  <span>Kitchen &amp; Good Company</span>
                </div>
              </div>

              <Link
                className="scroll-hint vc-hint"
                href="#kitchen"
                onClick={(event) => {
                  if (navigateSection("kitchen")) event.preventDefault();
                }}
              >
                <span>FRESH FOOD</span>
                <i /> <span>WARM WELCOMES</span>
                <i />
                <span>SIMPLE JOYS</span>
                <span className="scroll-arrow">↓</span>
              </Link>
            </section>
                <section
                  id="kitchen"
                  className="kitchen-section section-padding vc-next"
                >
                  <div className="kitchen-intro motion-reveal">
                    <div>
                      <span className="eyebrow">01 / From our kitchen</span>
                      <h2>
                        Honest food.
                        <br />
                        <em>Happy moments.</em>
                      </h2>
                    </div>
                    <div className="kitchen-intro-right">
                      <p>
                        Familiar favourites. A fresh little twist.
                        <br />
                        Made with care, meant to be shared.
                      </p>
                      <button className="text-link" onClick={() => openMenu()}>
                        A look at the menu <Arrow />
                      </button>
                    </div>
                  </div>
                  <div className="kitchen-layout">
                    <div className="signature-card motion-reveal">
                      <div className="signature-image">
                        <Image
                          width={1376}
                          height={768}
                          sizes="(max-width: 767px) 100vw, 50vw"
                          src={IMAGE.signature}
                          alt="Illustrative Sri Lankan chicken kottu with chopped roti and vegetables"
                          loading="lazy"
                        />
                        <span className="image-label">
                          A LITTLE CRAFT. A LOT OF FLAVOUR.
                        </span>
                      </div>
                      <div className="signature-bottom">
                        <div>
                          <span className="eyebrow">The kitchen favourite</span>
                          <h3>A better kind of bite.</h3>
                        </div>
                        <button
                          className="circle-button"
                          onClick={() => openMenu("Kottu & roti")}
                          aria-label="Explore Sri Lankan favourites"
                        >
                          <Arrow />
                        </button>
                      </div>
                    </div>
                    <div className="photo-mosaic" ref={mosaicRef}>
                      {[
                        {
                          title: "Fresh &\ncomforting",
                          subtitle: "A plate full of good things.",
                          cat: categories[0],
                        },
                        {
                          title: "Made for\nsharing.",
                          subtitle: "Better around a table.",
                          cat: categories[1],
                        },
                        {
                          title: "Something\nfor everyone.",
                          subtitle: "Find your new favourite.",
                          cat: categories[0],
                        },
                      ].map((tile, i) => (
                        <MaskedCard
                          key={tile.title}
                          position={maskPositions[i]}
                          imageWidth={imageWidth}
                          focalX={mobile ? 0.65 : 0.8}
                          cardRef={(el) => {
                            cardRefs.current[i] = el;
                          }}
                          className={`mosaic-tile mosaic-tile-${i} motion-reveal`}
                          onClick={() => openMenu(tile.cat)}
                        >
                          <span className="mosaic-content">
                            <span className="eyebrow">
                              0{i + 1} / GOOD FOOD, GOOD MOOD
                            </span>
                            <span className="mosaic-heading">{tile.title}</span>
                            <span className="mosaic-bottom">
                              <span>{tile.subtitle}</span>
                              <span className="circle-button">
                                <Arrow />
                              </span>
                            </span>
                          </span>
                        </MaskedCard>
                      ))}
                    </div>
                  </div>
                  <div className="kitchen-bottom">
                    <span>Good ingredients. No unnecessary fuss.</span>
                    <span className="sample-disclaimer">
                      Made to be shared.
                    </span>
                    <Sprig />
                  </div>
                </section>
            </div>
                <section
                  id="story"
                  className="story-section section-padding"
                >
                  <div className="story-layout">
                    <div className="story-left">
                      <div className="story-heading">
                        <span className="eyebrow">02 / More than a meal</span>
                        <h2>
                          A little kitchen.
                          <br />
                          <em>A lot of heart.</em>
                        </h2>
                        <p>
                          For slow lunches, little celebrations, and catch-ups
                          <br className="hidden md:block" /> that last a little
                          longer. You bring the good company.
                          <br className="hidden md:block" /> We’ll bring the
                          good food.
                        </p>
                      </div>
                      <div className="story-pictures">
                        <figure>
                          <Image
                            width={1376}
                            height={768}
                            sizes="(max-width: 767px) 100vw, 50vw"
                            src={IMAGE.chef}
                            alt="A chef finishing a fresh pasta dish with basil"
                            loading="lazy"
                          />
                          <figcaption>MADE WITH A LITTLE EXTRA CARE</figcaption>
                        </figure>
                        <figure>
                          <Image
                            width={1376}
                            height={768}
                            sizes="(max-width: 767px) 100vw, 50vw"
                            src={IMAGE.dessert}
                            alt="Illustrative Sri Lankan watalappan coconut and jaggery custard"
                            loading="lazy"
                          />
                          <figcaption>
                            ALWAYS ROOM FOR SOMETHING SWEET
                          </figcaption>
                        </figure>
                      </div>
                      <div className="table-invite">
                        <div>
                          <span className="eyebrow">
                            Make yourself at home.
                          </span>
                          <h3>
                            There’s a place
                            <br />
                            for you here.
                          </h3>
                        </div>
                        <button
                          className="button button-outline"
                          onClick={() => open("booking")}
                        >
                          Let’s make a plan <Arrow />
                        </button>
                      </div>
                    </div>
                    <div className="story-photo">
                      <Image
                        width={1376}
                        height={768}
                        sizes="(max-width: 767px) 100vw, 50vw"
                        src={IMAGE.restaurant}
                        alt="An inviting table in the Mila Mirissa restaurant concept"
                        loading="lazy"
                      />
                      <div className="story-photo-top">
                        <span className="eyebrow">
                          MICROECHEF / GOOD COMPANY, ALWAYS
                        </span>
                        <Sprig />
                      </div>
                      <div className="story-overlays">
                        <button
                          className="story-overlay solid"
                          onClick={() => open("story")}
                        >
                          <span>
                            The heart
                            <br />
                            of our
                            <br />
                            <em>kitchen.</em>
                          </span>
                          <span className="circle-button">
                            <Arrow />
                          </span>
                        </button>
                        <button
                          className="story-overlay glass"
                          onClick={() => openMenu("Something sweet")}
                        >
                          <span>
                            Save room
                            <br />
                            for a little
                            <br />
                            <em>sweetness.</em>
                          </span>
                          <span className="circle-button">
                            <Arrow />
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
          </>
        )}
        <footer
          id="footer"
          role="contentinfo"
          className="dining-footer site-footer"
          aria-label="Mila Mirissa footer"
        >
          <div className="dining-footer__stage" aria-hidden="true">
            <div className="dining-footer__ambience">
              <Image
                width={1376}
                height={768}
                sizes="100vw"
                src={IMAGE.restaurant}
                alt=""
                loading="lazy"
                className="dining-footer__image"
              />
            </div>
          </div>
          <div className="dining-footer__fog" aria-hidden="true" />
          <div className="dining-footer__content">
            <div
              className={
                storyPage ? "dining-brand motion-reveal" : "dining-brand"
              }
            >
              <Link
                className="dining-brand__logo"
                href={sectionHref("home")}
                aria-label="Mila Mirissa home"
                onClick={(event) => followSection(event, "home")}
              >
                <span className="dining-brand__mark dining-brand__mark--photo" aria-hidden="true">
                  <Image src="/images/mila-mirissa-logo-sm.png" alt="" width={64} height={64} />
                </span>
                <span>Mila Mirissa</span>
              </Link>
              <h2>Good food. Good company.</h2>
              <p className="dining-brand__text">
                A little kitchen for slow lunches, warm welcomes, and the people
                who make every meal a little more special. Pull up a chair.
                There’s always room for you.
              </p>
              <button
                className="dining-brand__cta"
                onClick={() => open("booking")}
              >
                Find your table <Arrow />
              </button>
              <p className="dining-brand__copyright">
                © {copyrightYear} Mila Mirissa. Freshly made. Happily shared.
              </p>
              <p className="dining-brand__care">
                <Sprig /> Made with care. Meant to be shared.
              </p>
              <div
                className="dining-brand__chips"
                aria-label="Our little pleasures"
              >
                <span>
                  <i aria-hidden="true" /> Fresh flavours
                </span>
                <span>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>{" "}
                  Made with care
                </span>
                <span>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>{" "}
                  Good company
                </span>
              </div>
            </div>
            <nav
              className={storyPage ? "dining-col motion-reveal" : "dining-col"}
              aria-label="Explore"
            >
              <h3>Explore</h3>
              <ul>
                {navLinks.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={sectionHref(link.id)}
                      onClick={(event) => {
                        followSection(event, link.id);
                      }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/menu" aria-current={menuPage ? "page" : undefined}>The menu</Link>
                </li>
              </ul>
            </nav>
            <nav
              className={storyPage ? "dining-col motion-reveal" : "dining-col"}
              aria-label="Your visit"
            >
              <h3>Your visit</h3>
              <ul>
                <li>
                  <button onClick={() => open("booking")}>Book a table</button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setFooterInfo("groups");
                      open("footerInfo");
                    }}
                  >
                    Groups
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setFooterInfo("dietary");
                      open("footerInfo");
                    }}
                  >
                    Dietary needs
                  </button>
                </li>
                <li>
                  <Link href="/contact">Contact us</Link>
                </li>
                <li>
                  <a href={`tel:${RESTAURANT.phones[0]}`}>{RESTAURANT.phones[0]}</a>
                </li>
                <li>
                  <a href={`mailto:${RESTAURANT.email}`}>{RESTAURANT.email}</a>
                </li>
              </ul>
            </nav>
            <nav
              className={storyPage ? "dining-col motion-reveal" : "dining-col"}
              aria-label="Good to know"
            >
              <h3>Good to know</h3>
              <ul>
                <li>
                  <button
                    onClick={() => {
                      setFooterInfo("ingredients");
                      open("footerInfo");
                    }}
                  >
                    Ingredients
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setFooterInfo("photos");
                      open("footerInfo");
                    }}
                  >
                    Food photos
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setFooterInfo("privacy");
                      open("footerInfo");
                    }}
                  >
                    Privacy
                  </button>
                </li>
                <li>
                  <Link
                    href={storyPage || menuPage ? "#main" : "#home"}
                    onClick={(event) => {
                      if (storyPage || menuPage) {
                        event.preventDefault();
                        window.scrollTo({
                          top: 0,
                          behavior: window.matchMedia(
                            "(prefers-reduced-motion: reduce)",
                          ).matches
                            ? "instant"
                            : "smooth",
                        });
                      } else if (navigateSection("home"))
                        event.preventDefault();
                    }}
                  >
                    Back to top ↑
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <p className="dining-footer__powered">powered by microechef</p>
        </footer>
      </main>
      {modal === "storyDetails" && (
        <Dialog title={STORY_INFO[storyDetail].title} onClose={closeModal}>
          <p className="dialog-intro">{STORY_INFO[storyDetail].text}</p>
        </Dialog>
      )}
      {modal === "footerInfo" && (
        <Dialog title={FOOTER_INFO[footerInfo].title} onClose={closeModal}>
          <p className="dialog-intro">{FOOTER_INFO[footerInfo].text}</p>
        </Dialog>
      )}
      {modal === "dish" && selectedDish && (
        <Dialog title={selectedDish.name} onClose={closeModal} wide>
          <MenuDishDetails dish={selectedDish} />
          <div className="wm-detail-actions"><button className="button button-dark" onClick={closeModal}>Back to the menu <Arrow /></button><button className="text-link" onClick={() => open("booking")}>Plan a visit <Arrow /></button></div>
        </Dialog>
      )}
      {modal === "booking" && (
        <Dialog title="A place at our table." onClose={closeModal}>
          <BookingForm />
        </Dialog>
      )}
      {modal === "visit" && (
        <Dialog title="Come and say hello." onClose={closeModal}>
          <p className="dialog-intro">A little kitchen. A warm welcome.</p>
          <Image
            width={1376}
            height={768}
            sizes="(max-width: 767px) 100vw, 50vw"
            className="visit-image"
            src={IMAGE.restaurant}
            alt="A warm, welcoming dining room"
          />
          <div className="contact-card">
            <div className="contact-card__row">
              <span className="contact-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M7.2 4.6h2.1l1.5 3.6-1.9 1.3a10.6 10.6 0 0 0 5.6 5.6l1.3-1.9 3.6 1.5v2.1a2.4 2.4 0 0 1-2.6 2.4A15.7 15.7 0 0 1 4.8 7.2a2.4 2.4 0 0 1 2.4-2.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <span className="contact-card__label">Call us</span>
                <span className="contact-card__value contact-card__value--icons">
                  {RESTAURANT.phones.map((number) => (
                    <a key={number} href={`tel:${number}`} className="contact-card__phone">
                      {number}
                    </a>
                  ))}
                </span>
                <span className="contact-card__hint">Tap to call — for a table today, a quick call is quickest.</span>
              </div>
            </div>

            <div className="contact-card__row">
              <span className="contact-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="m4.4 7.2 6.5 5.1a1.8 1.8 0 0 0 2.2 0l6.5-5.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <span className="contact-card__label">Email us</span>
                <span className="contact-card__value">
                  <a href={`mailto:${RESTAURANT.email}?subject=${encodeURIComponent("Hello Mila Mirissā")}`}>{RESTAURANT.email}</a>
                </span>
                <span className="contact-card__hint">Rooms, larger tables and anything planned ahead.</span>
              </div>
            </div>

            <div className="contact-card__row">
              <span className="contact-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 21s6.4-5.6 6.4-10.4A6.4 6.4 0 0 0 5.6 10.6C5.6 15.4 12 21 12 21Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <circle cx="12" cy="10.4" r="2.3" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </span>
              <div>
                <span className="contact-card__label">Find us</span>
                <span className="contact-card__value">Mirissa, Sri Lanka</span>
                <span className="contact-card__hint">The kitchen takes tables, rooms and takeaway — call or write and we’ll point you the right way.</span>
              </div>
            </div>
          </div>
          <div className="contact-card__actions">
            <button className="button button-dark" onClick={() => open("booking")}>
              Find your table <Arrow />
            </button>
            <button className="text-link" onClick={closeModal}>
              Back to the restaurant
            </button>
          </div>
        </Dialog>
      )}
      {modal === "story" && (
        <Dialog title="Small kitchen. Big heart." onClose={closeModal}>
          <Image
            width={1376}
            height={768}
            sizes="(max-width: 767px) 100vw, 50vw"
            className="visit-image"
            src={IMAGE.chef}
            alt="Fresh pasta being carefully finished by hand"
          />
          <p className="dialog-intro">The simple things, done with care.</p>
          <p className="story-text">
            Mila Mirissa is imagined as your neighbourhood pause: a place for
            familiar flavours, thoughtful details and a meal that feels like a
            little occasion.
          </p>
          <p className="story-text">
            The idea is simple. Good food should bring people together. Whether
            it’s a quick bite or a long conversation, there’s always a little
            more room around the table.
          </p>
          <p className="privacy-note">
            Brand concept copy — replace this with the restaurant’s actual
            history before launch.
          </p>
          <Link
            className="text-link full-story-link"
            href="/our-story"
            onClick={closeModal}
          >
            Explore our full story <Arrow />
          </Link>
          <button className="button button-dark" onClick={() => openMenu()}>
            Discover the kitchen <Arrow />
          </button>
        </Dialog>
      )}
    </div>
  );
}
