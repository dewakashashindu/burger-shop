"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

// Owner setup: replace the sample menu below and these details before going live.
// Leave unknown values empty: the website will never invent contact information.
const RESTAURANT = {
  name: "MicroEChef",
  email: "",
  phone: "",
  address: "",
  hours: "",
};
const IMAGE = {
  restaurant: `/images/restaurant.jpg`,
  table: `/images/table.jpg`,
  burger: `/images/burger.jpg`,
  chef: `/images/chef.jpg`,
  dessert: `/images/dessert.jpg`,
};
const categories = [
  "Kitchen favourites",
  "Fresh & comforting",
  "Something sweet",
  "Slow sips",
] as const;
type Category = (typeof categories)[number];
type Modal = "menu" | "booking" | "visit" | "story" | "footerInfo" | null;
const FOOTER_INFO = {
  groups: { title: "Good company, always.", text: "Planning a meal with a group? Please confirm availability and arrangements with the restaurant. Group-booking options and contact details have not been supplied yet." },
  dietary: { title: "A little care goes a long way.", text: "Please speak to the restaurant about allergies and dietary requirements before ordering. The sample menu is not an allergen guide, and this website does not guarantee that dishes are free from allergens or cross-contact." },
  ingredients: { title: "The simple things, done with care.", text: "The dishes shown are menu ideas. Please confirm current ingredients, sourcing and availability with the restaurant before ordering." },
  photos: { title: "A little restaurant atmosphere.", text: "Photography on this website is AI-generated concept imagery. It is not verified photography of the restaurant, its team or its dishes." },
  privacy: { title: "A thoughtful visit.", text: "The reservation planner saves your request draft in this browser only. Nothing is submitted and no table is reserved. Use “Clear draft & personal details” in the planner to delete it. Please avoid sensitive information in your notes. Fonts may load from an external font provider; your browser contacts that provider. The restaurant’s final privacy policy must be confirmed before launch." },
} as const;
const menu: Record<
  Category,
  { name: string; description: string; note: string }[]
> = {
  "Kitchen favourites": [
    {
      name: "The little classic",
      description:
        "A toasted brioche burger with grilled beef, cheddar, crisp greens and house sauce.",
      note: "Signature burger",
    },
    {
      name: "Golden chicken",
      description:
        "Crispy chicken, fresh slaw and a bright, tangy dressing in a soft bun.",
      note: "Comfort favourite",
    },
    {
      name: "Garden goodness",
      description:
        "A hearty vegetable patty, crunchy greens and a little herb dressing.",
      note: "Vegetarian",
    },
  ],
  "Fresh & comforting": [
    {
      name: "Tomato & basil pasta",
      description:
        "Pasta tossed with slow-cooked tomatoes, fresh basil and a little parmesan.",
      note: "From the kitchen",
    },
    {
      name: "The green bowl",
      description:
        "Seasonal leaves, crunchy vegetables and a fresh citrus dressing.",
      note: "Light & lovely",
    },
    {
      name: "Golden fries",
      description:
        "Crisp fries, a sprinkle of sea salt and your favourite dip.",
      note: "For the table",
    },
  ],
  "Something sweet": [
    {
      name: "A slice of slow",
      description: "Creamy Basque-style cheesecake with a deeply golden top.",
      note: "Kitchen-baked",
    },
    {
      name: "Chocolate moment",
      description:
        "A warm chocolate brownie, soft in the middle and made for sharing.",
      note: "A little indulgence",
    },
    {
      name: "Seasonal sweetness",
      description: "Something fresh, fruity and lovely. Ask what is in season.",
      note: "Seasonal idea",
    },
  ],
  "Slow sips": [
    {
      name: "A proper coffee",
      description:
        "A little pick-me-up. Enjoy it black, or with your choice of milk.",
      note: "Take a pause",
    },
    {
      name: "Citrus cooler",
      description: "Fresh citrus, a little sweetness and plenty of ice.",
      note: "Bright & refreshing",
    },
    {
      name: "The house iced tea",
      description: "Freshly brewed tea, served chilled with a slice of citrus.",
      note: "Sip slowly",
    },
  ],
};

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
const SCROLL_STOPS: Record<RestaurantSection, number> = {
  home: 0,
  kitchen: 0.56,
  story: 0.98,
};
function isRestaurantSection(
  value: string | undefined,
): value is RestaurantSection {
  return value === "home" || value === "kitchen" || value === "story";
}
function navigateSection(id: RestaurantSection, behavior?: ScrollBehavior) {
  const runway = document.querySelector<HTMLElement>(
    ".arch-scroll.motion-ready",
  );
  const stage = runway?.querySelector<HTMLElement>(".scroll-stage");
  if (!runway || !stage) return false;
  const top = runway.getBoundingClientRect().top + window.scrollY;
  const distance = Math.max(0, runway.offsetHeight - stage.clientHeight);
  window.scrollTo({
    top: top + distance * SCROLL_STOPS[id],
    behavior: behavior ?? "smooth",
  });
  try {
    window.history.replaceState(null, "", `#${id}`);
  } catch {
    /* Sandboxed offline previews cannot always edit history. */
  }
  return true;
}

/** Progressive enhancement: the server HTML is a readable, normal-flow page.
 * One continuous image is animated only after the controller is ready.
 * No React state updates or layout reads are performed for every card on scroll.
 */
function useArchScroll(
  runwayRef: RefObject<HTMLDivElement | null>,
  onSectionChange: (id: RestaurantSection) => void,
) {
  useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;
    const stage = runway.querySelector<HTMLElement>(".scroll-stage")!;
    const frame = runway.querySelector<HTMLElement>(".motion-frame")!;
    const photo = frame.querySelector<HTMLImageElement>("img")!;
    const wash = runway.querySelector<HTMLElement>(".motion-whitewash")!;
    const hero = runway.querySelector<HTMLElement>("#home")!;
    const kitchen = runway.querySelector<HTMLElement>("#kitchen")!;
    const story = runway.querySelector<HTMLElement>("#story")!;
    const target = runway.querySelector<HTMLElement>(".story-photo")!;
    const note = runway.querySelector<HTMLElement>(".motion-note")!;
    const caption = runway.querySelector<HTMLElement>(".motion-caption")!;
    const shell = runway.closest<HTMLElement>(".app-shell");
    const pieces = Array.from(
      kitchen.querySelectorAll<HTMLElement>(".motion-reveal"),
    );
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const smooth = (a: number, b: number, p: number) => {
      const t = clamp((p - a) / (b - a));
      return t * t * (3 - 2 * t);
    };
    type Rect = { x: number; y: number; w: number; h: number };
    let stop = () => {};

    const apply = () => {
      stop();
      if (reduced.matches || typeof ResizeObserver !== "function") {
        // Reduced-motion / unsupported browsers keep all three sections visible.
        if (!("IntersectionObserver" in window)) return;
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries)
              if (entry.isIntersecting && isRestaurantSection(entry.target.id))
                onSectionChange(entry.target.id);
          },
          { rootMargin: "-25% 0px -45% 0px" },
        );
        [hero, kitchen, story].forEach((el) => observer.observe(el));
        stop = () => observer.disconnect();
        return;
      }
      let raf = 0;
      let first: Rect = { x: 0, y: 0, w: 0, h: 0 };
      let last = first;
      let full = first;
      let runwayTop = 0;
      let distance = 1;
      let active: RestaurantSection | null = null;
      let disposed = false;
      const place = (
        el: HTMLElement,
        box: Rect,
        radius: number,
        bottom: number,
      ) => {
        el.style.left = `${box.x}px`;
        el.style.top = `${box.y}px`;
        el.style.width = `${box.w}px`;
        el.style.height = `${box.h}px`;
        el.style.borderRadius = `${radius}px ${radius}px ${bottom}px ${bottom}px`;
      };
      const layer = (el: HTMLElement, opacity: number) => {
        el.style.opacity = String(opacity);
        const hidden = opacity < 0.025;
        el.inert = hidden;
        el.setAttribute("aria-hidden", String(hidden));
      };
      const update = () => {
        raf = 0;
        if (disposed) return;
        const p = clamp((window.scrollY - runwayTop) / distance);
        const expand = smooth(0.035, 0.34, p),
          shrink = smooth(0.64, 0.92, p);
        const a = p < 0.64 ? first : full,
          b = p < 0.64 ? full : last,
          t = p < 0.64 ? expand : shrink;
        const rect = {
          x: mix(a.x, b.x, t),
          y: mix(a.y, b.y, t),
          w: mix(a.w, b.w, t),
          h: mix(a.h, b.h, t),
        };
        const firstRadius = Math.min(first.w / 2, first.h / 2),
          lastRadius = Math.min(last.w / 2, last.h / 2);
        const radius =
          p < 0.64 ? mix(firstRadius, 0, expand) : mix(0, lastRadius, shrink);
        place(
          frame,
          rect,
          radius,
          p < 0.64 ? mix(6, 0, expand) : mix(0, 7, shrink),
        );
        photo.style.transform = `scale(${mix(1, 1.045, expand * (1 - shrink))})`;
        const heroAlpha = 1 - smooth(0.04, 0.19, p);
        const foodAlpha = smooth(0.41, 0.5, p) * (1 - smooth(0.62, 0.71, p));
        const storyAlpha = smooth(0.72, 0.88, p);
        layer(hero, heroAlpha);
        layer(kitchen, foodAlpha);
        layer(story, storyAlpha);
        wash.style.opacity = String(
          0.967 * smooth(0.35, 0.45, p) * (1 - smooth(0.69, 0.89, p)),
        );
        pieces.forEach((el, i) => {
          const reveal = smooth(0.415 + i * 0.016, 0.49 + i * 0.016, p);
          el.style.opacity = String(reveal);
          el.style.transform = `translateY(${22 * (1 - reveal)}px)`;
        });
        note.style.opacity = String(heroAlpha);
        caption.style.opacity = String(heroAlpha);
        shell?.classList.toggle(
          "nav-over-photo",
          expand * (1 - shrink) * (1 - smooth(0.35, 0.44, p)) > 0.7,
        );
        runway.dataset.motionProgress = p.toFixed(4);
        const section = p < 0.35 ? "home" : p < 0.72 ? "kitchen" : "story";
        if (section !== active) {
          active = section;
          onSectionChange(section);
        }
      };
      const measure = () => {
        if (disposed) return;
        const w = stage.clientWidth,
          h = stage.clientHeight,
          mobile = w < 768;
        if (mobile)
          first = {
            x: w * 0.16,
            y: h * (h < 740 ? 0.495 : 0.49),
            w: w * 0.78,
            h: h * (h < 740 ? 0.365 : 0.4),
          };
        else {
          const width = Math.min(w * 0.425, 650),
            height = Math.min(h - 235, 700);
          first = {
            x: w - w * 0.047 - width,
            y: 108 + (h - 178 - height) / 2,
            w: width,
            h: height,
          };
        }
        const stageRect = stage.getBoundingClientRect(),
          end = target.getBoundingClientRect();
        last = {
          x: end.left - stageRect.left,
          y: end.top - stageRect.top,
          w: end.width,
          h: end.height,
        };
        target.style.borderRadius = `${Math.min(last.w / 2, last.h / 2)}px ${Math.min(last.w / 2, last.h / 2)}px 7px 7px`;
        full = { x: 0, y: 0, w, h };
        runwayTop = runway.getBoundingClientRect().top + window.scrollY;
        distance = Math.max(1, runway.offsetHeight - h);
        note.style.left = `${first.x - (mobile ? 19 : 34)}px`;
        note.style.top = `${first.y + first.h - (mobile ? 90 : 122)}px`;
        caption.style.left = `${first.x}px`;
        caption.style.top = `${first.y + first.h + 12}px`;
        caption.style.width = `${first.w}px`;
        update();
      };
      const requestUpdate = () => {
        if (!raf) raf = window.requestAnimationFrame(update);
      };
      const onHash = () => {
        const id = window.location.hash.slice(1);
        if (isRestaurantSection(id)) navigateSection(id, "instant");
      };
      runway.classList.add("motion-ready");
      measure();
      window.addEventListener("scroll", requestUpdate, { passive: true });
      window.addEventListener("resize", measure);
      window.addEventListener("hashchange", onHash);
      const observer = new ResizeObserver(measure);
      observer.observe(stage);
      observer.observe(target);
      const initialHashFrame = window.requestAnimationFrame(onHash);
      stop = () => {
        disposed = true;
        cancelAnimationFrame(raf);
        cancelAnimationFrame(initialHashFrame);
        observer.disconnect();
        window.removeEventListener("scroll", requestUpdate);
        window.removeEventListener("resize", measure);
        window.removeEventListener("hashchange", onHash);
        runway.classList.remove("motion-ready");
        shell?.classList.remove("nav-over-photo");
        [hero, kitchen, story].forEach((el) => {
          el.style.removeProperty("opacity");
          el.inert = false;
          el.removeAttribute("aria-hidden");
        });
        pieces.forEach((el) => {
          el.style.removeProperty("opacity");
          el.style.removeProperty("transform");
        });
        target.style.removeProperty("border-radius");
        delete runway.dataset.motionProgress;
      };
    };
    apply();
    reduced.addEventListener("change", apply);
    return () => {
      stop();
      reduced.removeEventListener("change", apply);
    };
  }, [runwayRef, onSectionChange]);
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
  const summary = `MicroEChef — reservation request draft\n\nName: ${form.name}\nEmail: ${form.email}\nDate: ${form.date}\nPreferred time: ${form.time}\nGuests: ${form.guests}\nNotes: ${form.notes || "None"}\n\nThis is a draft only. It has NOT been sent, and no table has been reserved. Please contact the restaurant to confirm availability.\n`;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([summary], { type: "text/plain" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "MicroEChef-reservation-draft.txt";
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
              <a
                className="text-link"
                href={`mailto:${RESTAURANT.email}?subject=${encodeURIComponent("Reservation request")}&body=${encodeURIComponent(summary)}`}
              >
                Open an email request <Arrow />
              </a>
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

export default function App() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [footerInfo, setFooterInfo] = useState<keyof typeof FOOTER_INFO>("photos");
  const [footerPaused, setFooterPaused] = useState(false);
  const [category, setCategory] = useState<Category>(categories[0]);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const copyrightYear = useSyncExternalStore(
    () => () => {},
    () => new Date().getFullYear(),
    () => 2026,
  );
  const mobile = useIsMobile();
  const closeModal = useCallback(() => setModal(null), []);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const runwayRef = useRef<HTMLDivElement>(null);
  useArchScroll(runwayRef, setActiveSection);
  const mosaicRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const maskPositions = useMaskPositions(mosaicRef, cardRefs);
  const imageWidth = useImageWidth(IMAGE.table, mosaicRef);
  const open = (value: Modal) => {
    setMobileMenu(false);
    setModal(value);
  };
  const openMenu = (value: Category = categories[0]) => {
    setCategory(value);
    open("menu");
  };
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = mobileMenu || modal ? "hidden" : "";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenu, modal]);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
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
    { label: "Our kitchen", id: "kitchen" },
    { label: "Our story", id: "story" },
  ] as const;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header
        className={`navbar ${scrolled ? "scrolled" : ""} ${mobileMenu ? "menu-is-open" : ""}`}
      >
        <a
          href="#home"
          className="brand"
          aria-label="MicroEChef home"
          onClick={(event) => {
            setMobileMenu(false);
            const id = event.currentTarget.getAttribute("href")?.slice(1);
            if (isRestaurantSection(id) && navigateSection(id))
              event.preventDefault();
          }}
        >
          MicroEChef<span>kitchen & good company</span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navLinks.slice(1).map((link) => (
            <a
              key={link.id}
              className={activeSection === link.id ? "active" : ""}
              href={`#${link.id}`}
              onClick={(event) => {
                if (navigateSection(link.id)) event.preventDefault();
              }}
              aria-current={activeSection === link.id ? "location" : undefined}
            >
              {link.label}
            </a>
          ))}
          <button onClick={() => open("visit")}>Visit us</button>
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
              <a
                style={{
                  transitionDelay: mobileMenu ? `${100 + i * 60}ms` : "0ms",
                }}
                key={link.id}
                href={`#${link.id}`}
                onClick={(event) => {
                  setMobileMenu(false);
                  const id = event.currentTarget.getAttribute("href")?.slice(1);
                  if (isRestaurantSection(id) && navigateSection(id))
                    event.preventDefault();
                }}
              >
                {link.label}
                <Arrow />
              </a>
            ))}
            <button
              onClick={() => openMenu()}
              style={{ transitionDelay: mobileMenu ? "280ms" : "0ms" }}
            >
              The menu
              <Arrow />
            </button>
            <button
              onClick={() => open("visit")}
              style={{ transitionDelay: mobileMenu ? "340ms" : "0ms" }}
            >
              Visit us
              <Arrow />
            </button>
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
        <div className="arch-scroll" ref={runwayRef}>
          <div className="scroll-stage">
            <div className="motion-frame" aria-hidden="true">
              <Image
                width={1376}
                height={768}
                sizes="100vw"
                src={IMAGE.restaurant}
                alt=""
                loading="eager"
                fetchPriority="high"
              />
              <div className="motion-whitewash" />
            </div>
            <div className="motion-note" aria-hidden="true">
              <span className="note-sun">☼</span>
              <span>
                Come hungry.
                <br />
                <em>Leave happy.</em>
              </span>
            </div>
            <div className="motion-caption" aria-hidden="true">
              <span>A SPACE TO SLOW DOWN</span>
              <span>AND STAY A LITTLE LONGER ↗</span>
            </div>

            <section id="home" className="hero-section motion-layer">
              <div className="hero-copy">
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
                  Pull up a chair. Settle into something delicious.
                  <br className="hidden md:block" /> At MicroEChef, there’s
                  always room for good food
                  <br className="hidden md:block" /> and even better company.
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
                <div className="hero-footnote">
                  <div className="little-seal">
                    <Sprig />
                  </div>
                  <div>
                    <strong>Fresh food. Warm welcomes.</strong>
                    <span>The simple things, done with care.</span>
                  </div>
                </div>
              </div>
              <div className="hero-visual">
                <div className="arch-image">
                  <Image
                    width={1376}
                    height={768}
                    sizes="(max-width: 767px) 100vw, 50vw"
                    src={IMAGE.restaurant}
                    alt="A sunlit restaurant with oak tables, olive-green seating and soft linen curtains"
                    fetchPriority="high"
                  />
                </div>
                <div className="image-caption">
                  <span>A SPACE TO SLOW DOWN</span>
                  <span>AND STAY A LITTLE LONGER ↗</span>
                </div>
                <div className="floating-note">
                  <span className="note-sun">☼</span>
                  <span>
                    Come hungry.
                    <br />
                    <em>Leave happy.</em>
                  </span>
                </div>
              </div>
              <a
                className="scroll-hint"
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
              </a>
            </section>
            <section
              id="kitchen"
              className="kitchen-section section-padding motion-layer"
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
                      src={IMAGE.burger}
                      alt="A brioche burger with melted cheese and crisp greens"
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
                      onClick={() => openMenu("Kitchen favourites")}
                      aria-label="Explore kitchen favourites"
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
                      cat: categories[1],
                    },
                    {
                      title: "Made for\nsharing.",
                      subtitle: "Better around a table.",
                      cat: categories[0],
                    },
                    {
                      title: "Something\nfor everyone.",
                      subtitle: "Find your new favourite.",
                      cat: categories[1],
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
                  A taste of the concept · menu items are illustrative.
                </span>
                <Sprig />
              </div>
            </section>
            <section
              id="story"
              className="story-section section-padding motion-layer"
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
                      <br className="hidden md:block" /> We’ll bring the good
                      food.
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
                        alt="A slice of cheesecake with berries and a coffee"
                        loading="lazy"
                      />
                      <figcaption>ALWAYS ROOM FOR SOMETHING SWEET</figcaption>
                    </figure>
                  </div>
                  <div className="table-invite">
                    <div>
                      <span className="eyebrow">Make yourself at home.</span>
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
                    alt="An inviting table in the MicroEChef restaurant concept"
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
          </div>
        </div>
        <footer id="footer" role="contentinfo" className={`dining-footer site-footer${footerPaused ? " is-paused" : ""}`} aria-label="MicroEChef footer">
          <div className="dining-footer__stage" aria-hidden="true">
            <div className="dining-footer__ambience">
              <Image width={1376} height={768} sizes="100vw" src={IMAGE.restaurant} alt="" loading="lazy" className="dining-footer__image" />
            </div>
          </div>
          <div className="dining-footer__fog" aria-hidden="true" />
          <div className="dining-footer__content">
            <div className="dining-brand">
              <a className="dining-brand__logo" href="#home" aria-label="MicroEChef home" onClick={(event) => { if (navigateSection("home")) event.preventDefault(); }}>
                <span className="dining-brand__mark" aria-hidden="true">m</span>
                <span>MicroEChef</span>
              </a>
              <h2>Good food. Good company.</h2>
              <p className="dining-brand__text">A little kitchen for slow lunches, warm welcomes, and the people who make every meal a little more special. Pull up a chair. There’s always room for you.</p>
              <button className="dining-brand__cta" onClick={() => open("booking")}>Find your table <Arrow /></button>
              <p className="dining-brand__copyright">© {copyrightYear} MicroEChef. Freshly made. Happily shared.</p>
              <p className="dining-brand__care"><Sprig /> Made with care. Meant to be shared.</p>
              <div className="dining-brand__chips" aria-label="Our little pleasures">
                <span><i aria-hidden="true" /> Fresh flavours</span>
                <span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" stroke="currentColor" strokeWidth="1.5" /></svg> Made with care</span>
                <span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" stroke="currentColor" strokeWidth="1.5" /></svg> Good company</span>
              </div>
            </div>
            <nav className="dining-col" aria-label="Explore">
              <h3>Explore</h3>
              <ul>
                {navLinks.map((link) => <li key={link.id}><a href={`#${link.id}`} onClick={(event) => { if (navigateSection(link.id)) event.preventDefault(); }}>{link.label}</a></li>)}
                <li><button onClick={() => openMenu()}>The menu</button></li>
              </ul>
            </nav>
            <nav className="dining-col" aria-label="Your visit">
              <h3>Your visit</h3>
              <ul>
                <li><button onClick={() => open("booking")}>Book a table</button></li>
                <li><button onClick={() => { setFooterInfo("groups"); open("footerInfo"); }}>Groups</button></li>
                <li><button onClick={() => { setFooterInfo("dietary"); open("footerInfo"); }}>Dietary needs</button></li>
                <li><button onClick={() => open("visit")}>Contact</button></li>
              </ul>
            </nav>
            <nav className="dining-col" aria-label="Good to know">
              <h3>Good to know</h3>
              <ul>
                <li><button onClick={() => { setFooterInfo("ingredients"); open("footerInfo"); }}>Ingredients</button></li>
                <li><button onClick={() => { setFooterInfo("photos"); open("footerInfo"); }}>Food photos</button></li>
                <li><button onClick={() => { setFooterInfo("privacy"); open("footerInfo"); }}>Privacy</button></li>
                <li><a href="#home" onClick={(event) => { if (navigateSection("home")) event.preventDefault(); }}>Back to top ↑</a></li>
              </ul>
            </nav>
          </div>
          <p className="dining-footer__powered">powered by microechef</p>
          <button className="dining-footer__motion" aria-pressed={footerPaused} onClick={() => setFooterPaused(!footerPaused)}>{footerPaused ? "▶ Play ambience" : "Ⅱ Pause ambience"}</button>
        </footer>
      </main>
      {modal === "footerInfo" && (
        <Dialog title={FOOTER_INFO[footerInfo].title} onClose={closeModal}>
          <p className="dialog-intro">{FOOTER_INFO[footerInfo].text}</p>
        </Dialog>
      )}
      {modal === "menu" && (
        <Dialog title="Something delicious awaits." onClose={closeModal} wide>
          <p className="dialog-intro">A little inspiration from our kitchen.</p>
          <div className="notice">
            Sample menu: dishes are illustrative. Final availability, prices and
            allergen information must be confirmed with the restaurant.
          </div>
          <div
            className="menu-tabs"
            role="tablist"
            aria-label="Menu categories"
          >
            {categories.map((cat, i) => (
              <button
                role="tab"
                aria-selected={category === cat}
                aria-controls="menu-items"
                id={`category-${i}`}
                key={cat}
                className={category === cat ? "selected" : ""}
                onClick={() => setCategory(cat)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const index = (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
                    setCategory(categories[index]);
                    document.getElementById(`category-${index}`)?.focus();
                  }
                }}
              >
                {cat}
              </button>
            ))}
          </div>
          <div
            className="menu-items"
            id="menu-items"
            role="tabpanel"
            aria-labelledby={`category-${categories.indexOf(category)}`}
          >
            {menu[category].map((item) => (
              <article key={item.name}>
                <div>
                  <span className="eyebrow">{item.note}</span>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                </div>
                <Sprig />
              </article>
            ))}
          </div>
          <p className="privacy-note">
            Have an allergy or a dietary requirement? Ask the team before
            ordering. This preview is not an allergen guide.
          </p>
          <button
            className="button button-dark"
            onClick={() => open("booking")}
          >
            Plan a visit <Arrow />
          </button>
        </Dialog>
      )}
      {modal === "booking" && (
        <Dialog title="A place at our table." onClose={closeModal}>
          <BookingForm />
        </Dialog>
      )}
      {modal === "visit" && (
        <Dialog title="We’d love to see you." onClose={closeModal}>
          <p className="dialog-intro">A little kitchen. A warm welcome.</p>
          <Image
            width={1376}
            height={768}
            sizes="(max-width: 767px) 100vw, 50vw"
            className="visit-image"
            src={IMAGE.restaurant}
            alt="A warm, welcoming dining room"
          />
          <div className="contact-list">
            <div>
              <span className="eyebrow">Find us</span>
              <p>
                {RESTAURANT.address || "Our location will be shared here soon."}
              </p>
            </div>
            <div>
              <span className="eyebrow">Opening hours</span>
              <p>{RESTAURANT.hours || "Opening hours are being confirmed."}</p>
            </div>
            <div>
              <span className="eyebrow">Say hello</span>
              <p>
                {RESTAURANT.email ? (
                  <a href={`mailto:${RESTAURANT.email}`}>{RESTAURANT.email}</a>
                ) : (
                  "Contact details will be added before launch."
                )}
              </p>
              {RESTAURANT.phone && (
                <a href={`tel:${RESTAURANT.phone}`}>{RESTAURANT.phone}</a>
              )}
            </div>
          </div>
          <div className="notice">
            Website preview — restaurant address, hours and contact details have
            not been provided. Images are AI-generated concept photography, not
            verified photos of the venue or its dishes.
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
            MicroEChef is imagined as your neighbourhood pause: a place for
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
          <button className="button button-dark" onClick={() => openMenu()}>
            Discover the kitchen <Arrow />
          </button>
        </Dialog>
      )}
    </div>
  );
}
