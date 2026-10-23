"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CATS, DISHES, PACKAGES, PHOTO, ROOMS, money, type Room } from "./booking-data";

type View =
  | "choose"
  | "reserve"
  | "table"
  | "rooms"
  | "roomList"
  | "room"
  | "roomBook"
  | "order"
  | "cart"
  | "checkout"
  | "success";
type Kind = "table" | "room" | "order";
type Errors = Record<string, string>;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tomorrow = iso(new Date(Date.now() + 864e5));
const today = iso(new Date());
const TIMES = ["12:00", "12:30", "13:00", "13:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];
const SEATING = ["No preference", "Window", "Garden terrace", "Centre of the room", "Quiet corner"];
const phoneOk = (v: string) => {
  const digits = v.replace(/[\s()-]/g, "");
  return /^(?:\+94|0094|0)?7\d{8}$/.test(digits) || /^\+?\d{9,15}$/.test(digits);
};

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Left = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const TableIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 9h18M5 9v10M19 9v10M8 9V6m8 3V6M6.5 5.5h3m5 0h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
);
const BedIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 18V7m0 8h18v3M3 12h18M6.5 9.5h4M14 12v-2m3 0h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const BagIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Zm3.5 0V6.5a3.5 3.5 0 0 1 7 0V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const TickIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m11 25 9 9 17-20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const LeafIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 4C9 4 4 9 4 16c0 2 1 4 1 4s2-9 15-12M6 20c2-6 7-9 11-10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
);
const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" /><path d="M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5M16 5.5a3 3 0 0 1 0 5.8M18 14.8c2 .6 3.2 2.3 3.6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.3" /><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
);
const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" stroke="currentColor" strokeWidth="1.3" /><circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" /></svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.3" /><path d="M12 11v6M12 7.6v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  min,
  placeholder,
  error,
  full,
  inputMode,
  maxLength = 160,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  min?: string;
  placeholder?: string;
  error?: string;
  full?: boolean;
  inputMode?: "tel" | "numeric" | "text";
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

function TextArea({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="field full">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} maxLength={400} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function BookingFlow({ start = "choose" }: { start?: "choose" | "table" | "rooms" | "order" }) {
  const [view, setView] = useState<View>(start === "order" ? "order" : "choose");
  const [kind, setKind] = useState<Kind>("table");
  const [ref, setRef] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [toast, setToast] = useState("");

  const [t, setT] = useState({
    name: "",
    phone: "",
    local: "2",
    foreign: "0",
    seating: SEATING[0],
    date: "",
    time: "",
    note: "",
  });
  const guests = Math.max(0, Number(t.local) || 0) + Math.max(0, Number(t.foreign) || 0);

  const [r, setR] = useState({
    cat: "all" as "all" | Room["cat"],
    guestType: "local" as "local" | "foreign",
    id: "",
    gallery: 0,
    checkin: "",
    checkout: "",
    guests: 2,
    name: "",
    phone: "",
    idno: "",
    pkg: "breakfast" as (typeof PACKAGES)[number]["id"],
    note: "",
  });
  const room = ROOMS.find((x) => x.id === r.id);
  const nights = (() => {
    if (!r.checkin || !r.checkout) return 0;
    const a = new Date(`${r.checkin}T12:00:00`).getTime();
    const b = new Date(`${r.checkout}T12:00:00`).getTime();
    return Math.max(0, Math.round((b - a) / 864e5));
  })();
  const cur: "LKR" | "USD" = r.guestType === "local" ? "LKR" : "USD";
  const stayPkg = PACKAGES.find((p) => p.id === r.pkg) ?? PACKAGES[0];
  const pkgRate = cur === "LKR" ? stayPkg.local : stayPkg.foreign;
  const roomRate = room ? (cur === "LKR" ? room.local : room.foreign) : 0;
  const roomTotal = (roomRate + pkgRate) * Math.max(nights, 0);

  const [order, setOrder] = useState({ method: "delivery" as "delivery" | "pickup", name: "", phone: "", address: "", note: "" });
  const [cart, setCart] = useState<Record<string, number>>({});
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ ...DISHES.find((d) => d.id === id)!, qty }))
    .filter((d) => d.id);
  const count = items.reduce((a, d) => a + d.qty, 0);
  const subtotal = items.reduce((a, d) => a + d.price * d.qty, 0);
  const delivery = order.method === "delivery" ? 350 : 0;

  const dishRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const cartRef = useRef<HTMLSpanElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };

  const flyToCart = (id: string) => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const source = dishRefs.current[id];
    const target = cartRef.current;
    if (!source || !target || typeof source.animate !== "function") return;
    const a = source.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const clone = document.createElement("img");
    clone.src = source.currentSrc || source.src;
    clone.alt = "";
    clone.className = "fly";
    Object.assign(clone.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(clone);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const animation = clone.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1, borderRadius: "9px" },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(.42)`, opacity: 1, borderRadius: "50%", offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0, borderRadius: "50%" },
      ],
      { duration: 720, easing: "cubic-bezier(.35,.8,.3,1)" },
    );
    animation.onfinish = () => clone.remove();
  };

  const go = (next: View, nextKind?: Kind) => {
    if (nextKind) setKind(nextKind);
    setErrors({});
    setView(next);
  };

  const confirmTable = () => {
    const next: Errors = {};
    if (t.name.trim().length < 2) next.name = "Please enter your name.";
    if (!phoneOk(t.phone)) next.phone = "Enter a valid phone number.";
    if (guests < 1) next.guests = "Add at least one guest (local or foreign).";
    if (!t.date) next.date = "Choose a date.";
    else if (t.date < tomorrow) next.date = "Please choose tomorrow or a later date.";
    if (!t.time) next.time = "Choose a seating time.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setKind("table");
    setRef(`MC-TBL-${Math.floor(1000 + Math.random() * 9000)}`);
    setView("success");
  };

  const confirmRoom = () => {
    const next: Errors = {};
    if (!r.checkin) next.checkin = "Choose a check-in date.";
    else if (!r.checkout) next.checkout = "Choose a check-out date.";
    else if (r.checkout <= r.checkin) next.checkout = "Check-out must be after check-in.";
    if (r.name.trim().length < 2) next.name = "Please enter the guest name.";
    if (!phoneOk(r.phone)) next.phone = "Enter a valid phone number.";
    if (r.idno.trim().length < 5) next.idno = "Enter the NIC or passport number.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setKind("room");
    setRef(`MC-STAY-${Math.floor(1000 + Math.random() * 9000)}`);
    setView("success");
  };

  const confirmOrder = () => {
    const next: Errors = {};
    if (!items.length) next.cart = "Your cart is empty.";
    if (order.name.trim().length < 2) next.name = "Please enter your name.";
    if (!phoneOk(order.phone)) next.phone = "Enter a valid phone number.";
    if (order.method === "delivery" && order.address.trim().length < 8) next.address = "Enter the delivery address.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setKind("order");
    setRef(`MC-ORD-${Math.floor(1000 + Math.random() * 9000)}`);
    setView("success");
  };

  const addToCart = (id: string) => {
    const dish = DISHES.find((d) => d.id === id);
    if (!dish) return;
    setCart((old) => ({ ...old, [id]: (old[id] ?? 0) + 1 }));
    flyToCart(id);
    notify(`${dish.name} added to your cart`);
  };
  const dec = (id: string) => {
    setCart((old) => {
      const nextQty = (old[id] ?? 0) - 1;
      const copy = { ...old };
      if (nextQty > 0) copy[id] = nextQty;
      else delete copy[id];
      return copy;
    });
  };
  const remove = (id: string) => {
    const line = document.querySelector(`[data-line="${id}"]`);
    const commit = () => setCart((old) => {
      const copy = { ...old };
      delete copy[id];
      return copy;
    });
    if (line) {
      line.classList.add("removing");
      setTimeout(commit, 220);
    } else commit();
  };

  const crumbs = (parts: { label: string; onClick?: () => void }[]) => (
    <div className="crumbs">
      {parts.map((p, i) => (
        <span key={p.label} style={{ display: "contents" }}>
          {p.onClick ? <button type="button" onClick={p.onClick}>{p.label}</button> : <span>{p.label}</span>}
          {i < parts.length - 1 && <i aria-hidden="true">/</i>}
        </span>
      ))}
    </div>
  );

  const summary = (children: ReactNode, head: ReactNode, foot: ReactNode, art?: string) => (
    <aside className="summary reveal" style={{ ["--d" as string]: "100ms" }}>
      {art && (
        <div className="sum-art">
          <Image src={art} alt="" width={1200} height={746} sizes="(max-width:900px) 100vw, 360px" />
        </div>
      )}
      <div className="sum-head">{head}</div>
      <div className="sum-body">{children}</div>
      <div className="sum-foot">{foot}</div>
    </aside>
  );

  /* ---------- views ---------- */

  const chooser = (
    <main className="shell">
      <section className="entry">
        <figure className="entry-art reveal" style={{ ["--d" as string]: "80ms" }}>
          <Image src={PHOTO.restaurant} alt="Warm restaurant interior with olive banquettes and sunlit tables" width={1376} height={768} sizes="(max-width:900px) 100vw, 55vw" priority />
          <figcaption>
            <span className="eyebrow" style={{ color: "#5f6c54" }}>A LITTLE PAUSE. A LOVELY MEAL.</span>
            <h2>Good food.<br /><em>Good company.</em></h2>
            <p>Your next little occasion starts<br />with a warm welcome.</p>
          </figcaption>
        </figure>
        <div className="entry-copy reveal">
          <span className="eyebrow">WELCOME TO THE TABLE</span>
          <h1 className="display">What are we<br /><em>planning today?</em></h1>
          <p className="lede">Reserve a table for lunch or dinner, stay the night in one of our rooms, or order your favourites to eat at home.</p>
          <div className="mode-cards">
            <button className="mode-card" type="button" onClick={() => go("reserve")}>
              <span className="ic"><TableIcon /></span>
              <span><strong>Reservation</strong><span>A table in the dining room, or a room for the night.</span></span>
              <span className="go"><Arrow /></span>
            </button>
            <button className="mode-card" type="button" onClick={() => go("order")}>
              <span className="ic"><BagIcon /></span>
              <span><strong>Order online</strong><span>Delivery or pickup from the kitchen menu.</span></span>
              <span className="go"><Arrow /></span>
            </button>
          </div>
          <p className="micro" style={{ marginTop: 18 }}>You can change your plan at any time.</p>
        </div>
      </section>
    </main>
  );

  const reserveChoice = (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Reservation" }])}
      <div className="flow-head reveal">
        <div>
          <span className="eyebrow">RESERVATION</span>
          <h1 className="display">A table, or<br /><em>a room?</em></h1>
          <p className="lede">Tell us what you’re planning and we’ll take it from there.</p>
        </div>
      </div>
      <div className="mode-cards" style={{ maxWidth: 720 }}>
        <button className="mode-card reveal" style={{ ["--d" as string]: "60ms" }} type="button" onClick={() => go("table", "table")}>
          <span className="ic"><TableIcon /></span>
          <span><strong>Table reservation</strong><span>A short form — your details, date and time.</span></span>
          <span className="go"><Arrow /></span>
        </button>
        <button className="mode-card reveal" style={{ ["--d" as string]: "150ms" }} type="button" onClick={() => go("rooms", "room")}>
          <span className="ic"><BedIcon /></span>
          <span><strong>Room reservation</strong><span>Browse rooms and packages, pick your dates and stay with us.</span></span>
          <span className="go"><Arrow /></span>
        </button>
      </div>
    </main>
  );

  const tableForm = (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Reservation", onClick: () => go("reserve") }, { label: "Table" }])}
      <div className="flow-head reveal">
        <div>
          <span className="eyebrow">TABLE RESERVATION</span>
          <h1 className="display">Reserve<br /><em>a table.</em></h1>
          <p className="lede">One short form. Tell us who’s coming and when, and we’ll take care of the rest.</p>
        </div>
      </div>
      <div className="split">
        <section className="panel reveal">
          <h3>Your reservation</h3>
          <p className="hint" style={{ marginBottom: 20 }}>Fields marked * are needed.</p>
          <div className="form-grid">
            <Field id="tname" label="Full name *" value={t.name} onChange={(v) => setT({ ...t, name: v })} placeholder="Your name" error={errors.name} autoComplete="name" />
            <Field id="tphone" label="Phone number *" value={t.phone} onChange={(v) => setT({ ...t, phone: v })} placeholder="07X XXX XXXX" inputMode="tel" error={errors.phone} autoComplete="tel" />
            <Field id="tdate" label="Date *" type="date" min={tomorrow} value={t.date} onChange={(v) => setT({ ...t, date: v })} error={errors.date} />
            <div className="field">
              <label htmlFor="ttime">Time *</label>
              <select id="ttime" value={t.time} onChange={(e) => setT({ ...t, time: e.target.value })} aria-invalid={errors.time ? true : undefined}>
                <option value="">Choose a time</option>
                {TIMES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              {errors.time && <p className="err" role="alert">{errors.time}</p>}
            </div>
            <div className="field">
              <label htmlFor="tlocal">Local guests *</label>
              <div className="guest-stepper">
                <button type="button" aria-label="One fewer local guest" onClick={() => setT({ ...t, local: String(Math.max(0, (Number(t.local) || 0) - 1)) })}>−</button>
                <input id="tlocal" type="number" inputMode="numeric" min="0" max="200" step="1" value={t.local} onChange={(e) => setT({ ...t, local: e.target.value })} aria-invalid={errors.guests ? true : undefined} />
                <button type="button" aria-label="One more local guest" onClick={() => setT({ ...t, local: String(Math.min(200, (Number(t.local) || 0) + 1)) })}>+</button>
              </div>
              <p className="micro">Guests living in Sri Lanka.</p>
            </div>
            <div className="field">
              <label htmlFor="tforeign">Foreign guests</label>
              <div className="guest-stepper">
                <button type="button" aria-label="One fewer foreign guest" onClick={() => setT({ ...t, foreign: String(Math.max(0, (Number(t.foreign) || 0) - 1)) })}>−</button>
                <input id="tforeign" type="number" inputMode="numeric" min="0" max="200" step="1" value={t.foreign} onChange={(e) => setT({ ...t, foreign: e.target.value })} />
                <button type="button" aria-label="One more foreign guest" onClick={() => setT({ ...t, foreign: String(Math.min(200, (Number(t.foreign) || 0) + 1)) })}>+</button>
              </div>
              <p className="micro">Visiting from abroad.</p>
            </div>
            <div className="field full guest-total">
              <span className="lab">Total guests</span>
              <b>{guests}</b>
              <p className="micro">Type any number you need — there’s no fixed limit. For larger parties, add a note below.</p>
              {errors.guests && <p className="err" role="alert" style={{ flexBasis: "100%" }}>{errors.guests}</p>}
            </div>
            <div className="field">
              <label htmlFor="tseating">Seating preference</label>
              <select id="tseating" value={t.seating} onChange={(e) => setT({ ...t, seating: e.target.value })}>
                {SEATING.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <TextArea id="tnote" label="Special requests" value={t.note} onChange={(v) => setT({ ...t, note: v })} placeholder="Allergies, a birthday, a high chair, anything else we should know…" />
          </div>
          <p className="micro" style={{ margin: "4px 0 0" }}>Please mention any allergies or dietary needs in the special requests box.</p>
          <div className="actions">
            <span className="note">Your table is held for 15 minutes after the seating time.</span>
            <button className="btn" type="button" onClick={confirmTable}>Confirm reservation <Arrow /></button>
          </div>
        </section>
        {summary(
          <>
            <h4>Dinner at MicroEChef</h4>
            <div className="sum-line"><span>Guest</span><b>{t.name || "—"}</b></div>
            <div className="sum-line"><span>Date</span><b>{t.date || "—"}</b></div>
            <div className="sum-line"><span>Time</span><b>{t.time || "—"}</b></div>
            <div className="sum-line"><span>Guests</span><b>{t.local} local · {t.foreign} foreign</b></div>
            <div className="sum-line"><span>Seating</span><b>{t.seating}</b></div>
            <div className="sum-total"><span>Table charge</span><strong>Free</strong></div>
          </>,
          <><span>Your table</span><span>{guests} {guests === 1 ? "guest" : "guests"}</span></>,
          "No payment is taken for a table reservation. You can order from the menu when you arrive.",
          PHOTO.restaurant,
        )}
      </div>
    </main>
  );

  const roomCats = (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Reservation", onClick: () => go("reserve") }, { label: "Stay" }])}
      <div className="flow-head reveal">
        <div>
          <span className="eyebrow">ROOM RESERVATION</span>
          <h1 className="display">Stay a little<br /><em>longer.</em></h1>
          <p className="lede">Choose the kind of stay that suits you. Every room opens to the garden or a courtyard.</p>
        </div>
      </div>
      <div className="cat-grid">
        {CATS.map((c, i) => (
          <button key={c.id} className="cat-card reveal" style={{ ["--d" as string]: `${i * 80}ms` }} type="button" onClick={() => { setR({ ...r, cat: c.id }); go("roomList"); }}>
            <span className="ph"><Image src={c.img} alt={c.name} width={1200} height={746} sizes="(max-width:767px) 100vw, 33vw" /></span>
            <span className="body"><span><strong>{c.name}</strong><small>{c.note}</small></span><span className="go"><Arrow /></span></span>
          </button>
        ))}
      </div>
      <div className="panel reveal" style={{ marginBottom: 16 }}>
        <h3>Stay packages</h3>
        <p className="hint" style={{ margin: "4px 0 14px" }}>Choose one when you book. Prices are per room, per night — local guest in LKR, foreign guest in USD.</p>
        <div className="extras" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
          {PACKAGES.map((p) => (
            <div key={p.id} className="extra" style={{ cursor: "default" }}>
              <span className="box" style={{ borderRadius: "50%", background: p.local ? "#faf8f1" : "var(--ink)", borderColor: p.local ? "var(--line2)" : "var(--ink)", display: "grid", placeItems: "center" }}>
                {!p.local && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--paper)", display: "block" }} />}
              </span>
              <span>{p.name}<small>{p.local ? "Added per night" : "The simple start"}</small></span>
              <b>{p.local ? `${money(p.local, "LKR")} / ${money(p.foreign, "USD")}` : "Included"}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="panel reveal" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h3>Looking for every room?</h3>
          <p className="hint">See all stays, photos, rates for local and foreign guests, and what’s included.</p>
        </div>
        <button className="btn" type="button" onClick={() => { setR({ ...r, cat: "all" }); go("roomList"); }}>Browse all rooms <Arrow /></button>
      </div>
    </main>
  );

  const roomList = (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Stay", onClick: () => go("rooms") }, { label: "Rooms" }])}
      <div className="flow-head">
        <div>
          <span className="eyebrow">ROOMS &amp; SUITES</span>
          <h1 className="display">{r.cat === "all" ? <>Every room,<br /><em>every mood.</em></> : <>{CATS.find((c) => c.id === r.cat)?.name},<br /><em>your way.</em></>}</h1>
          <p className="lede">Rates are shown per night. Choose local or foreign guest rates to see prices in LKR or USD.</p>
        </div>
        <div className="seg" role="group" aria-label="Guest rate">
          <button type="button" onClick={() => setR({ ...r, guestType: "local" })} aria-pressed={r.guestType === "local"}>Local guest · LKR</button>
          <button type="button" onClick={() => setR({ ...r, guestType: "foreign" })} aria-pressed={r.guestType === "foreign"}>Foreign guest · USD</button>
        </div>
      </div>
      <div className="room-list">
        {ROOMS.filter((x) => r.cat === "all" || x.cat === r.cat).map((x, i) => (
          <article className="room-row reveal" style={{ ["--d" as string]: `${i * 90}ms` }} key={x.id}>
            <div className="ph"><Image src={x.gallery[0]} alt={`${x.name} interior`} width={1200} height={746} sizes="(max-width:900px) 100vw, 55vw" /></div>
            <div className="body">
              <span className="eyebrow">{CATS.find((c) => c.id === x.cat)?.name}</span>
              <h3>{x.name}</h3>
              <p className="lede" style={{ fontSize: 11.5, maxWidth: "none" }}>{x.blurb}</p>
              <div className="meta">
                <span><LeafIcon />{x.size}</span>
                <span><UsersIcon />Sleeps {x.sleeps}</span>
                <span><PinIcon />{x.feature}</span>
              </div>
              <div className="chips"><span>Breakfast available</span><span>Air conditioning</span><span>Check-in 2pm</span></div>
              <div className="rate">
                <div><small>From, per night</small><b>{money(r.guestType === "local" ? x.local : x.foreign, r.guestType === "local" ? "LKR" : "USD")}</b></div>
                <button className="btn small" type="button" onClick={() => { setR({ ...r, id: x.id, gallery: 0 }); go("room"); }}>View room <Arrow /></button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="actions">
        <button className="text-link" type="button" onClick={() => go("rooms")}><Left /> Back to categories</button>
        <span className="micro">Rates are indicative and confirmed by the restaurant.</span>
      </div>
    </main>
  );

  const roomView = room && (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Rooms", onClick: () => { setR({ ...r, cat: "all" }); go("roomList"); } }, { label: room.name }])}
      <div className="detail">
        <div className="reveal">
          <div className="gallery-main">
            <Image src={room.gallery[r.gallery]} alt={`${room.name} photo ${r.gallery + 1}`} width={1200} height={746} sizes="(max-width:900px) 100vw, 55vw" />
            <span className="tag">{room.feature} · {room.size}</span>
          </div>
          <div className="thumbs" role="group" aria-label="Room photos">
            {room.gallery.map((g, i) => (
              <button key={g + i} type="button" aria-pressed={r.gallery === i} aria-label={`Show photo ${i + 1}`} onClick={() => setR({ ...r, gallery: i })}>
                <Image src={g} alt="" width={1200} height={746} sizes="120px" />
              </button>
            ))}
          </div>
        </div>
        <div className="reveal" style={{ ["--d" as string]: "100ms" }}>
          <span className="eyebrow">{CATS.find((c) => c.id === room.cat)?.name}</span>
          <h1>{room.name}</h1>
          <p className="lede">{room.blurb}</p>
          <div className="amenities">
            <span><LeafIcon />{room.size} interior</span><span><UsersIcon />Sleeps up to {room.sleeps}</span>
            <span><ClockIcon />Check-in 2pm · out 11am</span><span><PinIcon />{room.feature}</span>
            <span><CheckIcon />Breakfast available</span><span><CheckIcon />Air conditioning</span>
          </div>
          <div className="seg" role="group" aria-label="Guest rate">
            <button type="button" onClick={() => setR({ ...r, guestType: "local" })} aria-pressed={r.guestType === "local"}>Local guest · LKR</button>
            <button type="button" onClick={() => setR({ ...r, guestType: "foreign" })} aria-pressed={r.guestType === "foreign"}>Foreign guest · USD</button>
          </div>
          <div className="price-box">
            <div className="row"><span className="micro">Per night</span><strong style={{ font: "27px/1 Georgia,serif", fontWeight: 400 }}>{money(r.guestType === "local" ? room.local : room.foreign, r.guestType === "local" ? "LKR" : "USD")}</strong></div>
            <p className="micro" style={{ marginTop: 8 }}>Room only. Breakfast, half board and full board can be added next.</p>
          </div>
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <button className="text-link" type="button" onClick={() => { setR({ ...r, cat: "all" }); go("roomList"); }}><Left /> All rooms</button>
            <button className="btn" type="button" onClick={() => go("roomBook")}>Reserve this room <Arrow /></button>
          </div>
        </div>
      </div>
    </main>
  );

  const roomForm = room && (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Rooms", onClick: () => { setR({ ...r, cat: "all" }); go("roomList"); } }, { label: room.name, onClick: () => go("room") }, { label: "Book" }])}
      <div className="flow-head">
        <div>
          <span className="eyebrow">ROOM RESERVATION</span>
          <h1 className="display">Your stay,<br /><em>in a few details.</em></h1>
          <p className="lede">Check-in is from 2pm and check-out is at 11am. Tell us who’s coming and when.</p>
        </div>
      </div>
      <div className="split">
        <section className="panel reveal">
          <h3>Dates &amp; guests</h3>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <Field id="cIn" label="Check-in" type="date" min={today} value={r.checkin} onChange={(v) => setR({ ...r, checkin: v })} error={errors.checkin} />
            <Field id="cOut" label="Check-out" type="date" min={r.checkin || today} value={r.checkout} onChange={(v) => setR({ ...r, checkout: v })} error={errors.checkout} />
            <div className="field full">
              <span className="lab" id="rgLab">Guests</span>
              <div className="guest-pills" role="group" aria-labelledby="rgLab">
                {Array.from({ length: room.sleeps }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" aria-pressed={r.guests === n} onClick={() => setR({ ...r, guests: n })}>{n}</button>
                ))}
              </div>
              <p className="micro">This room sleeps up to {room.sleeps}.</p>
            </div>
          </div>
          <h3 style={{ marginTop: 26 }}>Package</h3>
          <p className="hint" style={{ marginBottom: 12 }}>Added per night, for the room.</p>
          <div className="seg" role="group" aria-label="Package" style={{ borderRadius: 8 }}>
            {PACKAGES.map((p) => (
              <button key={p.id} type="button" style={{ borderRadius: 5 }} aria-pressed={r.pkg === p.id} onClick={() => setR({ ...r, pkg: p.id })}>
                {p.name}{p.local || p.foreign ? ` · +${money(cur === "LKR" ? p.local : p.foreign, cur)}` : " · included"}
              </button>
            ))}
          </div>
          <h3 style={{ marginTop: 26 }}>Guest details</h3>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <Field id="rname" label="Full name" value={r.name} onChange={(v) => setR({ ...r, name: v })} placeholder="Your name" error={errors.name} autoComplete="name" />
            <Field id="rphone" label="Phone number" value={r.phone} onChange={(v) => setR({ ...r, phone: v })} placeholder="07X XXX XXXX" inputMode="tel" error={errors.phone} autoComplete="tel" />
            <Field id="rid" label="NIC or passport number" value={r.idno} onChange={(v) => setR({ ...r, idno: v })} placeholder="For the guest register" error={errors.idno} maxLength={30} />
            <div className="field">
              <span className="lab">Guest rate</span>
              <div className="seg" style={{ borderRadius: 8 }}>
                <button type="button" style={{ borderRadius: 5 }} aria-pressed={r.guestType === "local"} onClick={() => setR({ ...r, guestType: "local" })}>Local</button>
                <button type="button" style={{ borderRadius: 5 }} aria-pressed={r.guestType === "foreign"} onClick={() => setR({ ...r, guestType: "foreign" })}>Foreign</button>
              </div>
            </div>
            <TextArea id="rnote" label="Special requests" value={r.note} onChange={(v) => setR({ ...r, note: v })} placeholder="Late arrival, dietary needs, a quiet room…" />
          </div>
          <div className="actions">
            <button className="text-link" type="button" onClick={() => go("room")}><Left /> Back to room</button>
            <button className="btn" type="button" onClick={confirmRoom}>Confirm stay <Arrow /></button>
          </div>
        </section>
        {summary(
          <>
            <div className="sum-line"><span>Check-in</span><b>{r.checkin || "—"}</b></div>
            <div className="sum-line"><span>Check-out</span><b>{r.checkout || "—"}</b></div>
            <div className="sum-line"><span>Guests</span><b>{r.guests}</b></div>
            <div className="sum-line"><span>Package</span><b>{stayPkg.name}</b></div>
            <div className="sum-line"><span>Rate · {cur === "LKR" ? "local" : "foreign"} guest</span><b>{money(roomRate, cur)}</b></div>
            <div className="sum-total"><span>Total</span><strong>{nights ? money(roomTotal, cur) : "—"}</strong></div>
          </>,
          <><span>{room.name}</span><span>{nights || 0} {nights === 1 ? "night" : "nights"}</span></>,
          "Rates are indicative. No payment is taken on this website.",
          room.img,
        )}
      </div>
    </main>
  );

  const orderSummary = (
    <aside className="sticky-sum reveal" style={{ ["--d" as string]: "120ms" }}>
      <h3>Your order</h3>
      {items.length ? (
        <>
          {items.map((d) => (
            <div className="mini-line" key={d.id}><span>{d.qty} × {d.name}</span><span>{money(d.price * d.qty, "LKR")}</span></div>
          ))}
          <div className="fee-line"><span>Subtotal</span><span>{money(subtotal, "LKR")}</span></div>
          <div className="fee-line"><span>{order.method === "delivery" ? "Delivery" : "Pickup"}</span><span>{order.method === "delivery" ? money(delivery, "LKR") : "Free"}</span></div>
          <div className="sum-total"><span>Total</span><strong>{money(subtotal + delivery, "LKR")}</strong></div>
          <button className="btn block" style={{ marginTop: 16 }} type="button" onClick={() => go("cart")}>Review cart <Arrow /></button>
        </>
      ) : (
        <p className="micro">Your cart is empty. Add a dish to begin.</p>
      )}
      <div className="delivery-note">
        <InfoIcon />
        <span>{order.method === "delivery"
          ? "Delivery is estimated at 35–45 minutes once the kitchen accepts your order."
          : "Pickup from the restaurant, usually ready in 25–30 minutes."}</span>
      </div>
    </aside>
  );

  const orderView = (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Order online" }])}
      <div className="flow-head">
        <div>
          <span className="eyebrow">ORDER ONLINE</span>
          <h1 className="display">From our kitchen<br /><em>to your table.</em></h1>
          <p className="lede">Delivery within the city, or pick up from the restaurant. Add what you like — you can adjust the cart before confirming.</p>
        </div>
        <div className="seg" role="group" aria-label="Order type" style={{ alignSelf: "flex-end" }}>
          <button type="button" aria-pressed={order.method === "delivery"} onClick={() => setOrder({ ...order, method: "delivery" })}>Delivery</button>
          <button type="button" aria-pressed={order.method === "pickup"} onClick={() => setOrder({ ...order, method: "pickup" })}>Pickup</button>
        </div>
      </div>
      <div className="cart-layout">
        <div className="order-grid">
          {DISHES.map((d, i) => (
            <article className="dish reveal" style={{ ["--d" as string]: `${Math.min(i, 6) * 60}ms` }} key={d.id} data-dish={d.id}>
              <div className="ph">
                <Image ref={(el) => { dishRefs.current[d.id] = el; }} src={d.img} alt={d.name} width={1200} height={746} sizes="(max-width:767px) 100vw, 33vw" />
                <span className="tag">{d.tag}</span>
              </div>
              <div className="body">
                <h3>{d.name}</h3>
                <p>{d.desc}</p>
                <div className="foot">
                  <span className="price">{money(d.price, "LKR")}</span>
                  {cart[d.id] ? (
                    <div className="qty" role="group" aria-label={`${d.name} quantity`}>
                      <button type="button" aria-label={`Remove one ${d.name}`} onClick={() => dec(d.id)}>−</button>
                      <span aria-live="polite">{cart[d.id]}</span>
                      <button type="button" aria-label={`Add one ${d.name}`} onClick={() => addToCart(d.id)}>+</button>
                    </div>
                  ) : (
                    <button className="add" type="button" aria-label={`Add ${d.name} to cart`} onClick={() => addToCart(d.id)}><PlusIcon /> Add</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        {orderSummary}
      </div>
      <div className="actions">
        <span className="micro">Prices in LKR. Delivery fee LKR 350; pickup has no fee.</span>
        <button className="btn" type="button" onClick={() => go("cart")}>Go to cart <Arrow /></button>
      </div>
    </main>
  );

  const cartView = (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Order online", onClick: () => go("order") }, { label: "Cart" }])}
      <div className="flow-head">
        <div>
          <span className="eyebrow">YOUR CART</span>
          <h1 className="display">Everything<br /><em>in one place.</em></h1>
          <p className="lede">Change quantities, then add your delivery details.</p>
        </div>
      </div>
      <div className="cart-layout">
        <div>
          {items.length ? (
            <div className="cart-list">
              {items.map((d) => (
                <div className="cart-line" data-line={d.id} key={d.id}>
                  <Image src={d.img} alt="" width={1200} height={746} sizes="76px" />
                  <div>
                    <h4>{d.name}</h4>
                    <span className="unit">{money(d.price, "LKR")} each</span>
                    <div className="line-actions">
                      <div className="qty" role="group" aria-label={`${d.name} quantity`}>
                        <button type="button" aria-label={`Remove one ${d.name}`} onClick={() => dec(d.id)}>−</button>
                        <span>{d.qty}</span>
                        <button type="button" aria-label={`Add one ${d.name}`} onClick={() => addToCart(d.id)}>+</button>
                      </div>
                      <button className="text-link" type="button" onClick={() => remove(d.id)}>Remove</button>
                    </div>
                  </div>
                  <div className="line-total"><span className="micro">{d.qty} × {money(d.price, "LKR")}</span><span>{money(d.price * d.qty, "LKR")}</span></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-cart">
              <BagIcon />
              <h3 style={{ font: "23px Georgia,serif", fontWeight: 400, marginBottom: 6 }}>Your cart is empty</h3>
              <p className="micro" style={{ marginBottom: 18 }}>A few favourites from the kitchen are waiting.</p>
              <button className="btn" type="button" onClick={() => go("order")}>Browse the menu <Arrow /></button>
            </div>
          )}
          <div className="actions">
            <button className="text-link" type="button" onClick={() => go("order")}><Left /> Add more dishes</button>
            {items.length > 0 && <button className="btn" type="button" onClick={() => go("checkout")}>Continue to checkout <Arrow /></button>}
          </div>
        </div>
        {orderSummary}
      </div>
    </main>
  );

  const checkout = (
    <main className="shell flow">
      {crumbs([{ label: "Start", onClick: () => go("choose") }, { label: "Order", onClick: () => go("order") }, { label: "Cart", onClick: () => go("cart") }, { label: "Checkout" }])}
      <div className="flow-head">
        <div>
          <span className="eyebrow">CHECKOUT</span>
          <h1 className="display">Where shall we<br /><em>bring it?</em></h1>
          <p className="lede">We’ll confirm your order on the phone number below.</p>
        </div>
      </div>
      <div className="split">
        <section className="panel reveal">
          <h3>Delivery details</h3>
          <div className="seg" role="group" aria-label="Delivery or pickup" style={{ margin: "14px 0 20px", borderRadius: 8 }}>
            <button type="button" style={{ borderRadius: 5 }} aria-pressed={order.method === "delivery"} onClick={() => setOrder({ ...order, method: "delivery" })}>Deliver to me</button>
            <button type="button" style={{ borderRadius: 5 }} aria-pressed={order.method === "pickup"} onClick={() => setOrder({ ...order, method: "pickup" })}>I’ll pick up</button>
          </div>
          <div className="form-grid">
            <Field id="oname" label="Full name" value={order.name} onChange={(v) => setOrder({ ...order, name: v })} placeholder="Your name" error={errors.name} autoComplete="name" />
            <Field id="ophone" label="Phone number" value={order.phone} onChange={(v) => setOrder({ ...order, phone: v })} placeholder="07X XXX XXXX" inputMode="tel" error={errors.phone} autoComplete="tel" />
            {order.method === "delivery" ? (
              <Field id="oaddr" label="Delivery address" value={order.address} onChange={(v) => setOrder({ ...order, address: v })} placeholder="House, street, area" error={errors.address} full />
            ) : (
              <div className="field full">
                <label htmlFor="oaddr">Pickup</label>
                <input id="oaddr" value="MicroEChef, restaurant counter" readOnly />
              </div>
            )}
            <TextArea id="onote" label="Notes for the kitchen" value={order.note} onChange={(v) => setOrder({ ...order, note: v })} placeholder="Spice level, allergies, gate code…" />
          </div>
          {errors.cart && <p className="err" role="alert">{errors.cart}</p>}
          <div className="actions">
            <button className="text-link" type="button" onClick={() => go("cart")}><Left /> Back to cart</button>
            <button className="btn" type="button" onClick={confirmOrder}>Place order · {money(subtotal + delivery, "LKR")} <Arrow /></button>
          </div>
        </section>
        {summary(
          <>
            {items.map((d) => (
              <div className="sum-line" key={d.id}><span>{d.qty} × {d.name}</span><b>{money(d.price * d.qty, "LKR")}</b></div>
            ))}
            <div className="sum-line"><span>Subtotal</span><b>{money(subtotal, "LKR")}</b></div>
            <div className="sum-line"><span>{order.method === "delivery" ? "Delivery" : "Pickup"}</span><b>{order.method === "delivery" ? money(delivery, "LKR") : "Free"}</b></div>
            <div className="sum-total"><span>Total</span><strong>{money(subtotal + delivery, "LKR")}</strong></div>
          </>,
          <><span>Order summary</span><span>{count} {count === 1 ? "item" : "items"}</span></>,
          "No payment is taken on this website.",
        )}
      </div>
    </main>
  );

  const success = (
    <main className="shell flow">
      <div className="success screen">
        <div className="tick"><TickIcon /></div>
        <span className="eyebrow">{kind === "order" ? "ORDER CONFIRMED" : kind === "room" ? "STAY REQUESTED" : "RESERVATION REQUESTED"}</span>
        <h1 style={{ marginTop: 16 }}>
          {kind === "order" ? <>Your order is<br /><em>on its way.</em></> : kind === "room" ? <>Your room is<br /><em>ready for you.</em></> : <>Your table is<br /><em>waiting.</em></>}
        </h1>
        <p>
          {kind === "order"
            ? `Thank you, ${order.name.split(" ")[0] || "friend"}. The kitchen will call ${order.phone} to confirm.`
            : kind === "room"
              ? `${r.name.split(" ")[0] || "Guest"}, we’ve noted your stay from ${r.checkin} to ${r.checkout}.`
              : `Thank you, ${t.name.split(" ")[0] || "friend"}. We’ll see you at ${t.time} on ${t.date} for ${guests} ${guests === 1 ? "guest" : "guests"}.`}
        </p>
        <p className="micro">Your details stay in this browser tab — nothing has been sent to the restaurant yet.</p>
        <span className="ref">{ref}</span>
        <div className="success-actions">
          <button className="btn light" type="button" onClick={() => go("choose")}>Back to start</button>
          <button className="btn" type="button" onClick={() => go(kind === "order" ? "order" : kind === "room" ? "rooms" : "reserve")}>
            {kind === "order" ? "Order something else" : kind === "room" ? "See other rooms" : "Make another reservation"} <Arrow />
          </button>
        </div>
      </div>
    </main>
  );

  const body =
    view === "choose" ? chooser
      : view === "reserve" ? reserveChoice
        : view === "table" ? tableForm
          : view === "rooms" ? roomCats
            : view === "roomList" ? roomList
              : view === "room" ? roomView
                : view === "roomBook" ? roomForm
                  : view === "order" ? orderView
                    : view === "cart" ? cartView
                      : view === "checkout" ? checkout
                        : success;

  const showCart = ["order", "cart", "checkout"].includes(view);

  return (
    <div className="reserve-website">
      <a className="skip" href="#reserve-main">Skip to content</a>
      <header className="site-head">
        <div className="shell head-in">
          <Link className="brand" href="/" aria-label="MicroEChef home">MicroEChef<small>KITCHEN &amp; GOOD COMPANY</small></Link>
          <div className="head-right">
            {showCart && (
              <button className="cart-btn" type="button" onClick={() => go("cart")} aria-label={`Open cart, ${count} ${count === 1 ? "item" : "items"}`}>
                <BagIcon /><span>Cart</span><span className="cart-count" ref={cartRef}>{count}</span>
              </button>
            )}
            <button className="ghost-link" type="button" onClick={() => go("choose")}>Start again</button>
          </div>
        </div>
      </header>
      <div id="reserve-main">{body}</div>
      <div className={`toast${toast ? " show" : ""}`} role="status">{toast}</div>
    </div>
  );
}
