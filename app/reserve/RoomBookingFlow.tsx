"use client";

/**
 * RoomBookingFlow — the whole room-stay journey, in the "Editorial cream" skin
 * the rest of /reserve already uses.
 *
 *   Dates  →  Available rooms  →  Room detail  →  Your booking  →  Details  →  Confirmed
 *
 * Dates and times
 *   The calendar is a range picker: tap the check-in day, then the check-out
 *   day, and every night in between is selected at once. Check-in is from 2pm,
 *   check-out by 11am — the exact arrival and departure times are asked for on
 *   the details step, not here.
 *
 * Money
 *   `money()` and the room/package rates come from ./booking-data, so the
 *   figures match the rest of the site. A stay is priced per night × rooms.
 *
 * Scope
 *   UI only. No table is written and no endpoint is called. `HOLDS` is the one
 *   place a room's taken nights would arrive from, and it is empty on purpose —
 *   the calendar then behaves exactly as if every night were free.
 */

import Image from "next/image";
import { useMemo, useState, useSyncExternalStore } from "react";
import { PACKAGES, ROOMS, money, type Room } from "./booking-data";
import { useGuest } from "../session";
import SignInDialog, { type SignedInCustomer } from "../SignInDialog";
import "./room-booking.css";

/* ── calendar helpers — the restaurant's day is Asia/Colombo, not UTC ───── */
// A stable no-op store: the component only needs "what day is it in Colombo",
// read on the client so a server render and the browser can never disagree
// across midnight (Sri Lanka is UTC+5:30). The server snapshot is empty, so a
// server-rendered calendar shows no past days until it hydrates.
const noSubscribe = () => () => {};
const SL_TODAY = () => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};
const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  if (!iso) return "";
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
const diffDays = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const prettyDay = (iso: string) => {
  if (!iso) return "—";
  const d = toDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
};
const shortDay = (iso: string) => {
  if (!iso) return "—";
  const d = toDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
};
export const prettyTime = (hhmm: string) => {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

/* ── what the booking-data list does not carry (copy, not numbers) ──────── */
type Extra = { bed: string; view: string; desc: string; facilities: string[] };
/**
 * The one-line introduction used on the "four rooms" strip. The long `blurb`
 * in booking-data runs to three lines in a narrow card, so each room gets a
 * shorter sentence here — same facts, told quickly.
 */
const BRIEF: Record<string, string> = {
  garden: "Ground floor, your own door onto the lawn.",
  twin: "Two teak beds and a shaded terrace for two friends.",
  courtyard: "A sitting room, a deep bath and a private courtyard.",
  family: "Two bedrooms around one long, light living room.",
};

/** The bed, said as shortly as it can be on a small card. */
const BEDS: Record<string, string> = {
  garden: "1 queen bed",
  twin: "2 single beds",
  courtyard: "1 king bed + daybed",
  family: "2 bedrooms",
};

/**
 * How many of each room the house actually has. The four rooms on this site are
 * four real rooms — one Garden, one Twin, one Courtyard, one Family — so a stay
 * of two rooms is two different rooms, never the same one twice. When the
 * availability endpoint exists, this is the number it will return per night.
 */
const STOCK: Record<string, number> = { garden: 1, twin: 1, courtyard: 1, family: 1 };

const EXTRAS: Record<string, Extra> = {
  garden: {
    bed: "1 queen bed",
    view: "Garden view",
    desc: "The Garden Room sits on the ground floor with a private doorway onto the lawn. Linen bedding, a writing desk under the window, and a walk-in shower. Cool tiled floors and a ceiling fan for the afternoon, air conditioning for the night.",
    facilities: ["Air conditioning", "Ceiling fan", "Free Wi-Fi", "Private bathroom", "Hot water", "Garden view", "Tea & coffee", "Reading desk", "Mosquito net", "Fresh linen", "Daily housekeeping", "Beach towels"],
  },
  twin: {
    bed: "2 single beds",
    view: "Garden view",
    desc: "Ideal for friends travelling together. Two full single beds, a shaded terrace with two chairs, and a bathroom with a rain shower — the same garden outlook as the Garden Room, one step further from the pool.",
    facilities: ["Air conditioning", "Ceiling fan", "Free Wi-Fi", "Private bathroom", "Rain shower", "Hot water", "Terrace seating", "Garden view", "Tea & coffee", "Luggage rack", "Daily housekeeping", "Beach towels"],
  },
  courtyard: {
    bed: "1 king bed + daybed",
    view: "Private courtyard",
    desc: "A suite in two parts: a sitting room with a low sofa and a writing table, then the bedroom behind a timber screen. The bathroom has both a freestanding bath and a shower, and the walled courtyard is yours alone.",
    facilities: ["Air conditioning", "Ceiling fan", "Free Wi-Fi", "Private bathroom", "Bath & shower", "Hot water", "Private courtyard", "Sofa & daybed", "Minibar", "Nespresso machine", "Daily housekeeping", "Beach towels"],
  },
  family: {
    bed: "2 bedrooms · 1 king + 2 singles",
    view: "Garden & pool",
    desc: "The largest of the four. A king bedroom and a twin bedroom share a bathroom and a small dining table. Steps from the pool gate, with a veranda that stays shaded until the late afternoon.",
    facilities: ["Air conditioning", "Ceiling fan", "Free Wi-Fi", "2 bathrooms", "Bath & shower", "Hot water", "Dining table for 4", "Veranda", "Pool access", "Fridge", "Daily housekeeping", "Beach towels"],
  },
};

const HOUSE_FACILITIES = ["Pool & garden", "Beach 3 minutes on foot", "Breakfast on the terrace", "Free parking", "Airport transfer on request", "Laundry service"];
const ARRIVAL_TIMES = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];
const DEPARTURE_TIMES = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
const COUNTRIES = ["Sri Lanka", "India", "United Kingdom", "Germany", "Australia", "France", "Netherlands", "United States", "Canada", "Japan", "China", "United Arab Emirates", "Other"];
const MAX_NIGHTS = 30;

/**
 * Nights another guest already holds, per room — the only place availability
 * would arrive from. Empty today: no read, no write, nothing invented.
 *   { garden: [["2026-11-12", "2026-11-15"]] }  // nights 12, 13, 14
 */
const HOLDS: Record<string, [string, string][]> = {};

type Step = "dates" | "rooms" | "detail" | "summary" | "details" | "done";
type Errors = Record<string, string>;

const Stepper = ({
  value,
  min,
  max,
  onChange,
  label,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  suffix?: string;
}) => (
  <div>
    <span className="rbf-lab">{label}</span>
    <div className="rbf-stepper">
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="rbf-step-v">
        <b>{value}</b>
        {suffix ? ` ${suffix}` : ""}
      </span>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  </div>
);

/* A labelled field — module scope, so React never rebuilds it mid-render. */
const Field = ({
  id,
  label,
  children,
  error,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  error?: string;
}) => (
  <label className="rbf-field" htmlFor={id}>
    <span className="rbf-lab">{label}</span>
    {children}
    {error ? (
      <span className="rbf-err" role="alert">
        {error}
      </span>
    ) : null}
  </label>
);

export default function RoomBookingFlow({ onExit }: { onExit: () => void }) {
  const guest = useGuest();

  const [step, setStep] = useState<Step>("dates");
  const today = useSyncExternalStore(noSubscribe, SL_TODAY, () => "");

  const [month, setMonth] = useState(() => {
    const d = toDate(addDays(SL_TODAY(), 6));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  // The rooms in this stay. A guest with a family can take two — one guest
  // record, one booking, several rooms — so this is a list, not a number.
  const [picked, setPicked] = useState<string[]>([]);
  // How many rooms they said they need on the first step. The next step is a
  // basket with that many places in it, so the question is asked once, up
  // front, and the picking stays room by room.
  const [wanted, setWanted] = useState(1);
  const [pkgId, setPkgId] = useState<(typeof PACKAGES)[number]["id"]>("breakfast");
  const [cur, setCur] = useState<"LKR" | "USD">("LKR");

  const [roomId, setRoomId] = useState("");
  const [gallery, setGallery] = useState(0);
  // Set when a guest opens a room before choosing nights: the dates step then
  // offers to take them straight back to that room instead of the whole list.
  const [resumeRoom, setResumeRoom] = useState("");

  const [form, setForm] = useState({
    name: "",
    nic: "",
    email: "",
    country: "Sri Lanka",
    phone: "",
    note: "",
    arrival: "14:00",
    departure: "11:00",
    mode: "Car or tuk tuk",
    agree: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [signInOpen, setSignInOpen] = useState(false);
  const [booking, setBooking] = useState<null | {
    ref: string;
    roomId: string;
    checkin: string;
    checkout: string;
    arrival: string;
    departure: string;
    adults: number;
    children: number;
    rooms: string[];
    pkgId: string;
    cur: "LKR" | "USD";
    total: number;
    name: string;
    email: string;
    phone: string;
    country: string;
  }>(null);

  /* ── money + availability ─────────────────────────────────────────────── */
  const pkg = PACKAGES.find((p) => p.id === pkgId) ?? PACKAGES[0];
  const roomOf = (id: string) => ROOMS.find((r) => r.id === id) ?? ROOMS[0];
  const nights = checkin && checkout && checkout > checkin ? diffDays(checkin, checkout) : 0;
  const rateOf = (r: Room) => (cur === "LKR" ? r.local : r.foreign);
  const pkgRate = cur === "LKR" ? pkg.local : pkg.foreign;
  const perNight = (r: Room) => rateOf(r) + pkgRate;
  /** One room, the whole stay — what a single room card quotes. */
  const roomTotal = (r: Room) => perNight(r) * Math.max(nights, 0);
  const fromRate = Math.min(...ROOMS.map((r) => (cur === "LKR" ? r.local : r.foreign))) + pkgRate;

  /* ── the stay: a small basket of rooms ────────────────────────────────── */
  const guests = adults + children;
  const rooms = picked.length;
  const pickedRooms = picked.map(roomOf);
  const countOf = (id: string) => picked.filter((p) => p === id).length;
  const inStay = (id: string) => countOf(id) > 0;
  const canAdd = (id: string) => countOf(id) < (STOCK[id] ?? 1);
  const sleepsInStay = pickedRooms.reduce((n, r) => n + r.sleeps, 0);
  const nightlyTotal = pickedRooms.reduce((n, r) => n + perNight(r), 0);
  const stayTotal = nightlyTotal * Math.max(nights, 0);
  /** Enough beds for everyone who is coming. */
  const fitsEveryone = rooms > 0 && sleepsInStay >= guests;

  const addRoom = (id: string) =>
    setPicked((old) => (old.filter((x) => x === id).length < (STOCK[id] ?? 1) ? [...old, id] : old));
  const removeRoom = (id: string) =>
    setPicked((old) => {
      const i = old.lastIndexOf(id);
      return i < 0 ? old : [...old.slice(0, i), ...old.slice(i + 1)];
    });

  const holdsFor = (id: string) => HOLDS[id] ?? [];
  const isHeld = (id: string, iso: string) => holdsFor(id).some(([a, b]) => iso >= a && iso < b);
  const roomIsFree = (id: string, from: string, to: string) => {
    if (!from || !to) return true;
    for (let d = from; d < to; d = addDays(d, 1)) if (isHeld(id, d)) return false;
    return true;
  };
  const everyRoomHeld = (iso: string) => ROOMS.every((r) => isHeld(r.id, iso));
  const firstHeldBetween = (from: string, to: string) => {
    for (let d = from; d < to; d = addDays(d, 1)) if (everyRoomHeld(d)) return d;
    return "";
  };

  const available = useMemo(
    () => ROOMS.filter((r) => roomIsFree(r.id, checkin, checkout)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkin, checkout],
  );

  const room = roomId ? roomOf(roomId) : null;
  const extra = room ? EXTRAS[room.id] : null;

  /* ── the calendar ─────────────────────────────────────────────────────── */
  const cells = useMemo(() => {
    const total = new Date(Date.UTC(month.y, month.m + 1, 0, 12)).getUTCDate();
    const lead = new Date(Date.UTC(month.y, month.m, 1, 12)).getUTCDay();
    const list: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= total; d++) list.push(toISO(new Date(Date.UTC(month.y, month.m, d, 12))));
    return list;
  }, [month]);

  // Views are built eagerly and only one of them is shown, so this has to be
  // safe while the guest has not chosen any dates yet.
  const freeCancelDay = checkin ? prettyDay(addDays(checkin, -2)) : "two days before check-in";

  const freeThisMonth = cells.reduce((n, iso) => (iso && today && iso >= today && !everyRoomHeld(iso) ? n + 1 : n), 0);

  const canGoBack = useMemo(() => {
    if (!today) return true;
    const t = toDate(today);
    return month.y > t.getUTCFullYear() || (month.y === t.getUTCFullYear() && month.m > t.getUTCMonth());
  }, [month, today]);

  const canGoForward = useMemo(() => {
    if (!today) return true;
    const t = toDate(today);
    return (month.y - t.getUTCFullYear()) * 12 + (month.m - t.getUTCMonth()) < 12;
  }, [month, today]);

  const shiftMonth = (delta: number) =>
    setMonth((old) => {
      const raw = old.y * 12 + old.m + delta;
      return { y: Math.floor(raw / 12), m: ((raw % 12) + 12) % 12 };
    });

  const [calMsg, setCalMsg] = useState("");

  const pickDay = (iso: string) => {
    setCalMsg("");
    if (!checkin || checkout) {
      setCheckin(iso);
      setCheckout("");
      return;
    }
    if (iso <= checkin) {
      setCheckin(iso);
      setCheckout("");
      return;
    }
    if (diffDays(checkin, iso) > MAX_NIGHTS) {
      setCalMsg(`A single stay can be up to ${MAX_NIGHTS} nights — choose an earlier check-out.`);
      return;
    }
    const clash = firstHeldBetween(checkin, iso);
    if (clash) {
      setCalMsg(`${prettyDay(clash)} is fully booked across all four rooms.`);
      return;
    }
    setCheckout(iso);
  };

  const go = (next: Step) => {
    setStep(next);
    setErrors({});
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── confirm ──────────────────────────────────────────────────────────── */
  const readForm = () => ({ ...form, name: form.name.trim(), nic: form.nic.trim(), email: form.email.trim(), phone: form.phone.trim() });

  const validate = () => {
    const f = readForm();
    const e: Errors = {};
    if (f.name.length < 2) e.name = "Enter the guest name.";
    if (f.nic.length < 5) e.nic = "Enter the NIC or passport number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) e.email = "Enter a valid email — the confirmation goes there.";
    if (!/^0\d{9}$/.test(f.phone.replace(/[\s-]/g, ""))) e.phone = "Enter a 10-digit number, e.g. 0771234567.";
    if (!form.agree) e.agree = "Please accept the cancellation policy.";
    return e;
  };

  const finish = () => {
    setBooking({
      ref: `MM-${String(Date.now()).slice(-6)}`,
      roomId: picked[0] ?? "",
      checkin,
      checkout,
      arrival: form.arrival,
      departure: form.departure,
      adults,
      children,
      rooms: picked,
      pkgId,
      cur,
      total: stayTotal,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      country: form.country,
    });
    go("done");
  };

  const confirm = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Confirming a stay still needs a proven number, exactly as the table
    // booking does — the dialog opens over the still-filled form.
    if (!guest) {
      setSignInOpen(true);
      return;
    }
    finish();
  };

  const onSignedIn = (_customer: SignedInCustomer) => {
    setSignInOpen(false);
    setForm((old) => ({ ...old, phone: old.phone || _customer.phone || "" }));
    window.setTimeout(finish, 260);
  };

  /* ── small render helpers ─────────────────────────────────────────────── */
  const StepperTotals = (
    <>
      <div className="rbf-two">
        <Stepper label="Adults" value={adults} min={1} max={6} onChange={setAdults} />
        <Stepper label="Children" value={children} min={0} max={4} onChange={setChildren} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Stepper
          label="How many rooms?"
          value={wanted}
          min={1}
          max={ROOMS.length}
          onChange={setWanted}
          suffix={wanted === 1 ? "room" : "rooms"}
        />
      </div>
      <p className="rbf-micro" style={{ marginTop: 6 }}>
        {wanted === 1
          ? "You will pick the room on the next step."
          : `Next step you pick ${wanted} rooms — they can be the same type or different.`}
      </p>
    </>
  );

  const BoardPickers = (
    <div>
      <span className="rbf-lab">Board</span>
      <div className="rbf-pkgs">
        {PACKAGES.map((p) => {
          const add = cur === "LKR" ? p.local : p.foreign;
          return (
            <button
              key={p.id}
              type="button"
              className="rbf-pkg"
              aria-pressed={pkgId === p.id}
              onClick={() => setPkgId(p.id)}
            >
              <span className="rbf-dot" />
              <span className="rbf-pkg-txt">
                <span className="rbf-pkg-nm">{p.name}</span>
                <span className="rbf-pkg-ds">{add ? "Added per night" : "The simple start"}</span>
              </span>
              <span className="rbf-pkg-pr">
                {add ? (
                  <>
                    +{money(add, cur)}
                    <small>per night</small>
                  </>
                ) : (
                  "Included"
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const CurrencyPickers = (
    <div>
      <span className="rbf-lab">Currency</span>
      <div className="rbf-chips-row">
        {(["LKR", "USD"] as const).map((c) => (
          <button key={c} type="button" className={`rbf-chip${cur === c ? " ink" : ""}`} aria-pressed={cur === c} onClick={() => setCur(c)}>
            {c === "LKR" ? "LKR · local guest" : "USD · foreign guest"}
          </button>
        ))}
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════
     STEP 1 — dates
     ══════════════════════════════════════════════════════════════════════ */
  const viewDates = (
    <div className="rbf-wrap">
      <header className="rbf-hero rbf-up">
        <span className="rbf-eyebrow">Room reservation</span>
        <h1 className="rbf-display">
          Stay a little
          <br />
          <em>longer.</em>
        </h1>
        <p className="rbf-lede">
          Pick the nights first. Four rooms, one garden, and the sea a short walk down the lane. Check-in is from 2pm and
          check-out by 11am — you can tell us the exact times later.
        </p>
      </header>

      <div className="rbf-dates-grid">
        <div>
          <section className="rbf-card rbf-cal rbf-up" style={{ ["--d" as string]: "40ms" }}>
            <div className="rbf-cal-head">
              <button type="button" className="rbf-nav" onClick={() => shiftMonth(-1)} disabled={!canGoBack} aria-label="Previous month">‹</button>
              <div>
                <div className="rbf-mon">{`${MONTHS[month.m]} ${month.y}`}</div>
                <span className="rbf-mon-sub">{today ? `${freeThisMonth} free nights across the four rooms` : "Loading the calendar…"}</span>
              </div>
              <button type="button" className="rbf-nav" onClick={() => shiftMonth(1)} disabled={!canGoForward} aria-label="Next month">›</button>
              <div className="rbf-legend" aria-hidden="true">
                <span><i className="rbf-swd free" />Free</span>
                <span><i className="rbf-swd sel" />Selected</span>
                <span><i className="rbf-swd held" />Booked</span>
                <span><i className="rbf-swd past" />Past</span>
              </div>
            </div>

            <div className="rbf-dow" aria-hidden="true">
              {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
            </div>

            <div className="rbf-days" role="group" aria-label="Choose the stay dates">
              {cells.map((iso, i) => {
                if (!iso) return <div key={`b${i}`} className="rbf-day blank" aria-hidden="true" />;
                const past = Boolean(today) && iso < today;
                const held = !past && everyRoomHeld(iso);
                const inRange = Boolean(checkin && checkout && iso >= checkin && iso < checkout);
                const isStart = iso === checkin;
                const isEnd = Boolean(checkout) && iso === checkout;
                const cls = ["rbf-day"];
                if (past) cls.push("past");
                if (held) cls.push("held");
                if (today && iso === today) cls.push("today");
                if (inRange) cls.push("sel");
                if (isStart) cls.push("start");
                if (isEnd) cls.push("end");
                const tag = past ? "" : held ? "Booked" : isStart ? "Night 1" : inRange ? "Night" : isEnd ? "Check-out" : "";
                return (
                  <button
                    key={iso}
                    type="button"
                    className={cls.join(" ")}
                    disabled={past || held}
                    aria-pressed={inRange || undefined}
                    aria-label={`${prettyDay(iso)}${past ? " (past)" : held ? " (booked)" : isStart ? " (check-in)" : isEnd ? " (check-out)" : inRange ? " (night)" : ""}`}
                    onClick={() => pickDay(iso)}
                  >
                    <span className="rbf-num">{toDate(iso).getUTCDate()}</span>
                    {tag ? <span className="rbf-tag">{tag}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="rbf-cal-foot">
              <span>
                {!checkin
                  ? "Tap your check-in day."
                  : !checkout
                    ? "Now tap the check-out day — the nights in between are selected together."
                    : "Tap a later day to extend the stay, or an earlier one to start again."}
              </span>
              {calMsg ? <span className="rbf-cal-err" role="alert">{calMsg}</span> : null}
              {checkin || checkout ? (
                <button type="button" className="rbf-link rbf-spacer" onClick={() => { setCheckin(""); setCheckout(""); setCalMsg(""); }}>
                  Clear dates
                </button>
              ) : null}
            </div>
          </section>

          <section className="rbf-strip rbf-up" style={{ ["--d" as string]: "160ms" }}>
            <div className="rbf-strip-head">
              <h3>The four rooms</h3>
              <span>{wanted === 1 ? "You will choose one on the next step" : `You will choose ${wanted} on the next step`}</span>
            </div>
            <div className="rbf-strip-grid">
              {ROOMS.map((r) => {
                const e = EXTRAS[r.id];
                const brief = BRIEF[r.id];
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="rbf-cat"
                    onClick={() => {
                      setRoomId(r.id);
                      setGallery(0);
                      go("detail");
                    }}
                  >
                    <span className="rbf-cat-pic">
                      <Image src={r.img} alt={r.name} width={680} height={520} sizes="(max-width:640px) 50vw, (max-width:1040px) 50vw, 280px" />
                    </span>
                    <span className="rbf-cat-cap">
                      <b>{r.name}</b>
                      <span className="rbf-cat-brief">{brief}</span>
                      <span className="rbf-cat-meta">
                        {r.size} · sleeps {r.sleeps}
                      </span>
                      <span className="rbf-cat-bed">{BEDS[r.id] ?? e.bed}</span>
                      <span className="rbf-cat-price">
                        from {money(cur === "LKR" ? r.local : r.foreign, cur)} <i>a night</i>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="rbf-sticky">
          <div className="rbf-card rbf-pad rbf-up" style={{ ["--d" as string]: "90ms" }}>
            <h3 className="rbf-ct">Your stay</h3>
            <div style={{ marginTop: 14 }}>{StepperTotals}</div>
            <div style={{ marginTop: 14 }}>{BoardPickers}</div>
            <div style={{ marginTop: 14 }}>{CurrencyPickers}</div>

            <div className="rbf-sum-sep">
              <div className="rbf-qline"><span>Check-in</span><b>{checkin ? shortDay(checkin) : "—"}</b></div>
              <div className="rbf-qline"><span>Check-out</span><b>{checkout ? shortDay(checkout) : "—"}</b></div>
              <div className="rbf-qline"><span>Nights</span><b>{nights || "—"}</b></div>
              <div className="rbf-qline"><span>Rooms</span><b>{wanted} {wanted === 1 ? "room" : "rooms"}{rooms ? ` · ${rooms} chosen` : " · choose next"}</b></div>
              <div className="rbf-qline"><span>From</span><b>{money(fromRate, cur)} / night</b></div>
            </div>

            {resumeRoom && nights ? (
              <button
                type="button"
                className="rbf-btn block"
                style={{ marginTop: 14 }}
                onClick={() => { addRoom(resumeRoom); setRoomId(resumeRoom); setGallery(0); go("summary"); }}
              >
                <span>Reserve the {roomOf(resumeRoom).name}</span>
                <span>→</span>
              </button>
            ) : (
              <button type="button" className="rbf-btn block" style={{ marginTop: 14 }} disabled={!nights} onClick={() => go("rooms")}>
                <span>See available rooms</span>
                <span>→</span>
              </button>
            )}
            {resumeRoom ? (
              <button
                type="button"
                className="rbf-link"
                style={{ marginTop: 8, display: "inline-block" }}
                onClick={() => { setRoomId(resumeRoom); setGallery(0); go("detail"); }}
              >
                Back to the {roomOf(resumeRoom).name}
              </button>
            ) : null}
            <p className="rbf-micro" style={{ marginTop: 8 }}>
              {nights
                ? `${guests} guest${guests === 1 ? "" : "s"} · ${nights} ${nights === 1 ? "night" : "nights"} · ${wanted} ${wanted === 1 ? "room" : "rooms"}`
                : "Choose your dates to continue."}
            </p>
            <div className="rbf-notebox">
              <span>ⓘ</span>
              <span>No card is taken on this website. The desk confirms every stay by phone, and nothing is charged until you arrive.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════
     STEP 2 — available rooms
     ══════════════════════════════════════════════════════════════════════ */
  const viewRooms = (
    <div className="rbf-wrap">
      <div className="rbf-page-head rbf-up">
        <div className="rbf-ph-t">
          <span className="rbf-eyebrow">Step 2 · Rooms</span>
          <h1 className="rbf-display sm">
            Choose your rooms
            <br />
            <em>{shortDay(checkin)} → {shortDay(checkout)}.</em>
          </h1>
          <p className="rbf-lede sm">
            {nights} {nights === 1 ? "night" : "nights"} · {guests} guest{guests === 1 ? "" : "s"} · {pkg.name}. You asked for{" "}
            {wanted} {wanted === 1 ? "room" : "rooms"} — {wanted === 1 ? "pick it" : "pick them"} below; the types can be mixed.
          </p>
        </div>
        <div className="rbf-daterow">
          <button type="button" className="rbf-btn light small" onClick={() => go("dates")}>
            <span>Change dates</span>
            <span>↺</span>
          </button>
        </div>
      </div>

      <div className="rbf-roomgrid">
        <div className="rbf-roomlist">
          {available.length === 0 ? (
            <div className="rbf-card rbf-empty">
              No room is free on those nights. Try different dates.
              <div style={{ marginTop: 12 }}>
                <button type="button" className="rbf-btn light small" onClick={() => go("dates")}><span>Change dates</span><span>↺</span></button>
              </div>
            </div>
          ) : null}

          {available.map((r, i) => {
            const e = EXTRAS[r.id];
            const mine = inStay(r.id);
            const free = (STOCK[r.id] ?? 1) - countOf(r.id);
            return (
              <article
                key={r.id}
                className={`rbf-card rbf-roomcard${mine ? " is-in" : ""} rbf-up`}
                style={{ ["--d" as string]: `${i * 70}ms` }}
              >
                <div className="rbf-rc-pic">
                  <Image src={r.img} alt={r.name} fill sizes="(max-width:900px) 100vw, 300px" style={{ objectFit: "cover" }} />
                  {mine ? <span className="rbf-badge">In your stay</span> : r.id === "courtyard" ? <span className="rbf-badge">Only 1 left for these dates</span> : null}
                </div>
                <div className="rbf-rc-body">
                  <div className="rbf-rc-title">
                    <span className="rbf-rc-nm">{r.name}</span>
                    {mine ? <span className="rbf-chip ink">Added</span> : <span className="rbf-chip good">Available</span>}
                  </div>
                  <p className="rbf-rc-blurb">{r.blurb}</p>
                  <div className="rbf-chips-row">
                    <span className="rbf-chip">{r.size}</span>
                    <span className="rbf-chip">Sleeps {r.sleeps}</span>
                    <span className="rbf-chip">{e.bed}</span>
                    <span className="rbf-chip">{e.view}</span>
                  </div>
                  <div className="rbf-chips-row">
                    {e.facilities.slice(0, 5).map((f) => <span key={f} className="rbf-chip">{f}</span>)}
                    <span className="rbf-chip">+{e.facilities.length - 5} more</span>
                  </div>
                  <div className="rbf-rc-foot">
                    <div className="rbf-price">
                      <b>{money(roomTotal(r), cur)}</b>
                      <small>{money(perNight(r), cur)} per night · {nights} {nights === 1 ? "night" : "nights"}</small>
                    </div>
                    <div className="rbf-acts">
                      <button type="button" className="rbf-btn light small" onClick={() => { setRoomId(r.id); setGallery(0); go("detail"); }}>
                        <span>View details</span>
                        <span>↗</span>
                      </button>
                      {mine ? (
                        <button type="button" className="rbf-btn light small" onClick={() => removeRoom(r.id)}>
                          <span>Remove</span>
                          <span>×</span>
                        </button>
                      ) : (
                        <button type="button" className="rbf-btn small" disabled={free <= 0} onClick={() => addRoom(r.id)}>
                          <span>Add this room</span>
                          <span>+</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rbf-sticky">
          <div className="rbf-card rbf-pad rbf-up" style={{ ["--d" as string]: "80ms" }}>
            <div className="rbf-sum-head">
              <h3 className="rbf-ct">Your rooms</h3>
              <span className={`rbf-chip${rooms >= wanted ? " ink" : ""}`}>{rooms} of {wanted} chosen</span>
            </div>
            <p className="rbf-micro" style={{ marginTop: 4 }}>
              {guests} guest{guests === 1 ? "" : "s"} · the rooms below sleep {sleepsInStay}
            </p>

            <div className="rbf-basket">
              {Array.from({ length: Math.max(wanted - rooms, 0) }, (_, i) => (
                <div className="rbf-bslot empty" key={`free-${i}`}>
                  <span className="rbf-n">{rooms + i + 1}</span>
                  <span className="rbf-bslot-t"><span>Empty — add a room below</span></span>
                </div>
              ))}
              {pickedRooms.map((r, i) => (
                <div className="rbf-bslot" key={`${r.id}-${i}`}>
                  <span className="rbf-n">{i + 1}</span>
                  <span className="rbf-bslot-t">
                    <b>{r.name}</b>
                    <span>Sleeps {r.sleeps} · {money(perNight(r), cur)} a night</span>
                  </span>
                  <span className="rbf-bslot-p">{money(roomTotal(r), cur)}</span>
                  <button type="button" className="rbf-bx" onClick={() => removeRoom(r.id)} aria-label={`Remove ${r.name} from the stay`}>×</button>
                </div>
              ))}
            </div>

            {rooms > 0 && !fitsEveryone ? (
              <p className="rbf-cal-err" role="status" style={{ marginTop: 8 }}>
                {guests - sleepsInStay} guest{guests - sleepsInStay === 1 ? "" : "s"} still without a bed — add another room.
              </p>
            ) : null}

            <div className="rbf-qtot"><span>Total</span><strong>{money(stayTotal, cur)}</strong></div>
            <p className="rbf-micro">{nights} {nights === 1 ? "night" : "nights"} · {pkg.name} · pay at the property</p>

            <button
              type="button"
              className="rbf-btn block"
              style={{ marginTop: 12 }}
              disabled={!fitsEveryone || rooms < wanted}
              onClick={() => go("summary")}
            >
              <span>
                {rooms < wanted
                  ? `Add ${wanted - rooms} more room${wanted - rooms === 1 ? "" : "s"}`
                  : rooms > 1
                    ? `Continue with ${rooms} rooms`
                    : "Continue with this room"}
              </span>
              <span>→</span>
            </button>
            <div className="rbf-notebox">
              <span>ⓘ</span>
              <span>
                {wanted > 1 ? `You asked for ${wanted} rooms. ` : ""}
                Four rooms in the house — one of each. Nothing is charged now; the desk confirms by phone.
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════
     STEP 3 — room detail
     ══════════════════════════════════════════════════════════════════════ */
  const viewDetail = room && extra ? (
    <div className="rbf-wrap">
      <div className="rbf-crumbs rbf-up">
        <button type="button" onClick={() => go("rooms")}>Rooms</button>
        <span className="sep">/</span>
        <span>{room.name}</span>
      </div>

      <div className="rbf-detail">
        <div className="rbf-up">
          <div className="rbf-gal">
            <div className="rbf-gal-main">
              <Image src={room.gallery[gallery]} alt={`${room.name} photo ${gallery + 1}`} width={1200} height={746} sizes="(max-width:1040px) 100vw, 640px" />
            </div>
            <div className="rbf-thumbs">
              {room.gallery.map((src, i) => (
                <button key={`${src}-${i}`} type="button" aria-pressed={gallery === i} aria-label={`Photo ${i + 1}`} onClick={() => setGallery(i)}>
                  <Image src={src} alt="" width={240} height={150} sizes="120px" />
                </button>
              ))}
            </div>
          </div>

          <div className="rbf-card rbf-detailbox">
            <h2>{room.name}</h2>
            <div className="rbf-chips-row" style={{ marginTop: 8 }}>
              <span className="rbf-chip ink">{room.size}</span>
              <span className="rbf-chip">Sleeps {room.sleeps}</span>
              <span className="rbf-chip">{extra.bed}</span>
              <span className="rbf-chip">{extra.view}</span>
            </div>
            <p className="rbf-desc">{extra.desc}</p>

            <h4 className="rbf-h4">In the room</h4>
            <div className="rbf-facgrid">
              {extra.facilities.map((f) => <span key={f} className="rbf-fac"><i>✓</i>{f}</span>)}
            </div>

            <h4 className="rbf-h4">The house</h4>
            <div className="rbf-facgrid">
              {HOUSE_FACILITIES.map((f) => <span key={f} className="rbf-fac"><i>✓</i>{f}</span>)}
            </div>

            <h4 className="rbf-h4">Good to know</h4>
            <div className="rbf-rows">
              <div className="rbf-row"><span>Check-in</span><b>From 2:00 PM</b></div>
              <div className="rbf-row"><span>Check-out</span><b>By 11:00 AM</b></div>
              <div className="rbf-row"><span>Board</span><b>{pkg.name}</b></div>
              <div className="rbf-row"><span>Free cancellation</span><b>Until {freeCancelDay}</b></div>
              <div className="rbf-row"><span>Payment</span><b>At the property</b></div>
              <div className="rbf-row"><span>Rate</span><b>{cur === "LKR" ? "Local guest · LKR" : "Foreign guest · USD"}</b></div>
            </div>
          </div>
        </div>

        <aside className="rbf-sticky">
          <div className="rbf-card rbf-pad rbf-up" style={{ ["--d" as string]: "80ms" }}>
            <div className="rbf-detail-price">
              <span>{money(perNight(room), cur)}</span>
              <em>per night</em>
            </div>
            <p className="rbf-micro" style={{ marginTop: 4 }}>
              {pkg.name}
              {pkgRate ? ` · +${money(pkgRate, cur)}` : ""}
            </p>

            <div className="rbf-specs">
              <button type="button" className="rbf-spec rbf-spec-btn" onClick={() => { setResumeRoom(room.id); go("dates"); }}>
                <span>Check-in</span><b>{checkin ? shortDay(checkin) : "Choose"}</b>
              </button>
              <button type="button" className="rbf-spec rbf-spec-btn" onClick={() => { setResumeRoom(room.id); go("dates"); }}>
                <span>Check-out</span><b>{checkout ? shortDay(checkout) : "Choose"}</b>
              </button>
              <div className="rbf-spec"><span>Guests</span><b>{guests}</b></div>
              <div className="rbf-spec"><span>In your stay</span><b>{rooms} {rooms === 1 ? "room" : "rooms"}</b></div>
            </div>

            {nights ? (
              <>
                <div className="rbf-sum-sep" style={{ marginTop: 12 }}>
                  <div className="rbf-qline"><span>{money(rateOf(room), cur)} × {nights} nights</span><b>{money(rateOf(room) * nights, cur)}</b></div>
                  <div className="rbf-qline">
                    <span>{pkg.name}{pkgRate ? ` × ${nights}` : ""}</span>
                    <b>{pkgRate ? money(pkgRate * nights, cur) : "Included"}</b>
                  </div>
                  {rooms > 1 ? (
                    <div className="rbf-qline"><span>{rooms - 1} other {rooms - 1 === 1 ? "room" : "rooms"} in this stay</span><b>{money(stayTotal - roomTotal(room), cur)}</b></div>
                  ) : null}
                </div>
                <div className="rbf-qtot"><span>{rooms > 1 ? "Stay total" : "Total"}</span><strong>{money(rooms > 0 ? stayTotal : roomTotal(room), cur)}</strong></div>
              </>
            ) : null}

            {!nights ? (
              <button type="button" className="rbf-btn block" style={{ marginTop: 14 }} onClick={() => { setResumeRoom(room.id); go("dates"); }}>
                <span>Pick your dates</span>
                <span>→</span>
              </button>
            ) : inStay(room.id) ? (
              <button
                type="button"
                className="rbf-btn block"
                style={{ marginTop: 12 }}
                disabled={!fitsEveryone || rooms < wanted}
                onClick={() => go("summary")}
              >
                <span>
                  {rooms < wanted
                    ? `Add ${wanted - rooms} more room${wanted - rooms === 1 ? "" : "s"}`
                    : rooms > 1
                      ? `Continue with ${rooms} rooms`
                      : "Continue with this room"}
                </span>
                <span>→</span>
              </button>
            ) : (
              <button type="button" className="rbf-btn block" style={{ marginTop: 12 }} disabled={!canAdd(room.id)} onClick={() => addRoom(room.id)}>
                <span>{canAdd(room.id) ? "Add to your stay" : "Already in your stay"}</span>
                <span>+</span>
              </button>
            )}
            {nights && inStay(room.id) ? (
              <button type="button" className="rbf-btn light block small" style={{ marginTop: 8 }} onClick={() => removeRoom(room.id)}>
                <span>Remove from your stay</span>
                <span>×</span>
              </button>
            ) : null}
            <button type="button" className="rbf-btn light block small" style={{ marginTop: 8 }} onClick={() => go("rooms")}>
              <span>{rooms ? "Back to all the rooms" : "See the other rooms"}</span>
              <span>‹</span>
            </button>
            <div className="rbf-notebox" style={{ marginTop: 12 }}>
              <span>ⓘ</span>
              <span>
                {!nights
                  ? "Pick your nights next and we bring you straight back to this room — nothing is charged now."
                  : fitsEveryone
                    ? "You will not be charged now. The desk calls to confirm within a few hours."
                    : rooms < wanted
                      ? `You asked for ${wanted} rooms — ${inStay(room.id) ? "go back and pick the rest" : "add this one to the basket"}.`
                      : `${sleepsInStay} of ${guests} guests have a bed so far — add another room for the rest.`}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  ) : null;

  /* ══════════════════════════════════════════════════════════════════════
     STEP 4 — your booking (everything chosen, each with a change button)
     ══════════════════════════════════════════════════════════════════════ */
  const viewSummary = nights && rooms > 0 ? (
    <div className="rbf-wrap">
      <div className="rbf-page-head rbf-up">
        <div className="rbf-ph-t">
          <span className="rbf-eyebrow">Step 3 · Your booking</span>
          <h1 className="rbf-display sm">
            One last look
            <br />
            <em>before we hold {rooms > 1 ? "them" : "it"}.</em>
          </h1>
          <p className="rbf-lede sm">Everything below can still be changed. Nothing is charged today.</p>
        </div>
      </div>

      <div className="rbf-sumgrid">
        <div className="rbf-up">
          <div className="rbf-card rbf-pad">
            <div className="rbf-sum-head">
              <h3 className="rbf-ct">{rooms > 1 ? `Your ${rooms} rooms` : "Your room"}</h3>
              <button type="button" className="rbf-chg" onClick={() => go("rooms")}>manage rooms</button>
            </div>

            <div className="rbf-picked">
              {pickedRooms.map((r, i) => (
                <div className="rbf-picked-row" key={`${r.id}-${i}`}>
                  <Image src={r.img} alt="" width={112} height={84} sizes="84px" />
                  <div className="rbf-picked-t">
                    <span className="rbf-sel-nm">{r.name}</span>
                    <span className="rbf-micro">{r.size} · sleeps {r.sleeps} · {EXTRAS[r.id].bed}</span>
                  </div>
                  <div className="rbf-picked-p">
                    <b>{money(roomTotal(r), cur)}</b>
                    <span>{money(perNight(r), cur)} a night</span>
                  </div>
                  <button type="button" className="rbf-bx" onClick={() => removeRoom(r.id)} aria-label={`Remove ${r.name}`}>×</button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="rbf-selrow">
                <span>Check-in</span>
                <b>{prettyDay(checkin)} · from {prettyTime(form.arrival)}
                  <button type="button" className="rbf-chg" onClick={() => go("dates")}>change</button>
                </b>
              </div>
              <div className="rbf-selrow">
                <span>Check-out</span>
                <b>{prettyDay(checkout)} · by {prettyTime(form.departure)}
                  <button type="button" className="rbf-chg" onClick={() => go("dates")}>change</button>
                </b>
              </div>
              <div className="rbf-selrow"><span>Nights</span><b>{nights}</b></div>
              <div className="rbf-selrow">
                <span>Guests</span>
                <b>{adults} adult{adults === 1 ? "" : "s"}{children ? ` · ${children} child${children === 1 ? "" : "ren"}` : ""}
                  <button type="button" className="rbf-chg" onClick={() => go("dates")}>change</button>
                </b>
              </div>
              <div className="rbf-selrow">
                <span>Board</span>
                <b>{pkg.name}
                  <button
                    type="button"
                    className="rbf-chg"
                    onClick={() => {
                      const i = PACKAGES.findIndex((p) => p.id === pkgId);
                      setPkgId(PACKAGES[(i + 1) % PACKAGES.length].id);
                    }}
                  >
                    change
                  </button>
                </b>
              </div>
              <div className="rbf-selrow">
                <span>Rate</span>
                <b>{cur === "LKR" ? "Local guest · LKR" : "Foreign guest · USD"}
                  <button type="button" className="rbf-chg" onClick={() => setCur(cur === "LKR" ? "USD" : "LKR")}>change</button>
                </b>
              </div>
            </div>

            <div className="rbf-complete">
              <span className="rbf-ic">✓</span>
              <span>
                <b>Free cancellation until {freeCancelDay}</b>
                <span>Cancel before then and nothing is charged. After that the first night is kept.</span>
              </span>
            </div>
          </div>

          <div className="rbf-actions-row">
            <button type="button" className="rbf-btn light" onClick={() => go("rooms")}>
              <span>Add another room</span>
              <span>+</span>
            </button>
            <button type="button" className="rbf-btn" style={{ marginLeft: "auto" }} onClick={() => go("details")}>
              <span>Continue to guest details</span>
              <span>→</span>
            </button>
          </div>
        </div>

        <aside className="rbf-sticky">
          <div className="rbf-card rbf-pad rbf-up" style={{ ["--d" as string]: "80ms" }}>
            <h3 className="rbf-ct">Price</h3>
            <div style={{ marginTop: 10 }}>
              {pickedRooms.map((r, i) => (
                <div className="rbf-qline" key={`${r.id}-${i}`}>
                  <span>{r.name} · {nights} {nights === 1 ? "night" : "nights"}</span>
                  <b>{money(roomTotal(r), cur)}</b>
                </div>
              ))}
              <div className="rbf-qline"><span>{pkg.name}</span><b>Included</b></div>
              <div className="rbf-qline"><span>Service &amp; taxes</span><b>Included</b></div>
            </div>
            <div className="rbf-qtot"><span>Total</span><strong>{money(stayTotal, cur)}</strong></div>
            <p className="rbf-micro" style={{ marginTop: 6 }}>{money(nightlyTotal, cur)} a night · pay at the property</p>
            <div className="rbf-notebox">
              <span>ⓘ</span>
              <span>Rates are placeholders for this layout and must be replaced with confirmed business data.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  ) : null;

  /* ══════════════════════════════════════════════════════════════════════
     STEP 5 — guest details
     ══════════════════════════════════════════════════════════════════════ */
  const viewDetails = pickedRooms.length && nights ? (
    <div className="rbf-wrap">
      <div className="rbf-page-head rbf-up">
        <div className="rbf-ph-t">
          <span className="rbf-eyebrow">Step 4 · Guest details</span>
          <h1 className="rbf-display sm">
            Who shall we
            <br />
            <em>expect?</em>
          </h1>
          <p className="rbf-lede sm">The desk uses these details for the guest register, and to call you if anything changes.</p>
        </div>
      </div>

      <div className="rbf-sumgrid">
        <div className="rbf-card rbf-pad rbf-up">
          <h3 className="rbf-ct">Your details</h3>

          <div className="rbf-two" style={{ marginTop: 14 }}>
            <Field id="rbfName" label="Full name *" error={errors.name}>
              <input
                id="rbfName"
                value={form.name}
                placeholder="As on the NIC or passport"
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field id="rbfNic" label="NIC or passport number *" error={errors.nic}>
              <input
                id="rbfNic"
                value={form.nic}
                placeholder="For the guest register"
                maxLength={30}
                aria-invalid={errors.nic ? true : undefined}
                onChange={(e) => setForm({ ...form, nic: e.target.value })}
              />
            </Field>
          </div>

          <div className="rbf-two">
            <Field id="rbfEmail" label="Email *" error={errors.email}>
              <input
                id="rbfEmail"
                type="email"
                value={form.email}
                placeholder="you@example.com"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field id="rbfPhone" label="Phone number *" error={errors.phone}>
              <input
                id="rbfPhone"
                value={form.phone}
                placeholder="07X XXX XXXX"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={errors.phone ? true : undefined}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>

          <div className="rbf-two">
            <Field id="rbfCountry" label="Country *">
              <select id="rbfCountry" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field id="rbfArrival" label="Arriving at">
              <select id="rbfArrival" value={form.arrival} onChange={(e) => setForm({ ...form, arrival: e.target.value })}>
                {ARRIVAL_TIMES.map((t) => (
                  <option key={t} value={t}>{prettyTime(t)}{t < "14:00" ? " · early" : t === "14:00" ? " · from 2pm" : ""}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rbf-two">
            <Field id="rbfDeparture" label="Leaving by">
              <select id="rbfDeparture" value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })}>
                {DEPARTURE_TIMES.map((t) => (
                  <option key={t} value={t}>{prettyTime(t)}{t > "11:00" ? " · late" : t === "11:00" ? " · by 11am" : ""}</option>
                ))}
              </select>
            </Field>
            <Field id="rbfMode" label="Arriving by">
              <select id="rbfMode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                {["Car or tuk tuk", "Airport transfer", "Bus to Matara", "Not sure yet"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          <Field id="rbfNote" label="Special requests">
            <textarea
              id="rbfNote"
              value={form.note}
              maxLength={400}
              placeholder="Late arrival, dietary needs, a quiet room, a cot for a child…"
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>

          <label className="rbf-agree">
            <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} />
            <span>
              I agree to the cancellation policy — free until {freeCancelDay}, after which the first night is kept. No card is taken on this website.
              {errors.agree ? <span className="rbf-err">{errors.agree}</span> : null}
            </span>
          </label>

          <div className="rbf-actions-row" style={{ marginTop: 16 }}>
            <button type="button" className="rbf-btn light" onClick={() => go("summary")}>
              <span>Back</span>
              <span>‹</span>
            </button>
            <button type="button" className="rbf-btn" style={{ marginLeft: "auto" }} onClick={confirm}>
              <span>Confirm booking</span>
              <span>→</span>
            </button>
          </div>
          <p className="rbf-micro" style={{ marginTop: 10 }}>
            {guest ? `Signed in as ${guest.phone} — the booking is saved to this number.` : "You will be asked to sign in once — then the booking is confirmed."}
          </p>
        </div>

        <aside className="rbf-sticky">
          <div className="rbf-card rbf-pad rbf-up" style={{ ["--d" as string]: "80ms" }}>
            <div className="rbf-mini">
              <Image src={pickedRooms[0].img} alt="" width={76} height={76} sizes="76px" />
              <div>
                <b>{pickedRooms.length > 1 ? `${pickedRooms.length} rooms` : pickedRooms[0].name}</b>
                <span className="rbf-micro" style={{ display: "block" }}>{shortDay(checkin)} → {shortDay(checkout)}</span>
              </div>
            </div>
            {pickedRooms.length > 1 ? (
              <div className="rbf-chips-row" style={{ marginTop: 8 }}>
                {pickedRooms.map((r, i) => <span className="rbf-chip" key={`${r.id}-${i}`}>{r.name}</span>)}
              </div>
            ) : null}
            <div className="rbf-sum-sep" style={{ marginTop: 12 }}>
              <div className="rbf-qline"><span>Nights</span><b>{nights}</b></div>
              <div className="rbf-qline"><span>Guests</span><b>{guests}</b></div>
              <div className="rbf-qline"><span>Rooms</span><b>{rooms}</b></div>
              <div className="rbf-qline"><span>Board</span><b>{pkg.name}</b></div>
              <div className="rbf-qline"><span>Rate</span><b>{cur === "LKR" ? "Local · LKR" : "Foreign · USD"}</b></div>
            </div>
            <div className="rbf-qtot"><span>Total</span><strong>{money(stayTotal, cur)}</strong></div>
            <div className="rbf-notebox" style={{ marginTop: 10 }}>
              <span>✓</span>
              <span>Free cancellation until <b>{freeCancelDay}</b>. Pay at the property.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  ) : null;

  /* ══════════════════════════════════════════════════════════════════════
     STEP 6 — confirmed
     ══════════════════════════════════════════════════════════════════════ */
  const viewDone = booking ? (
    <div className="rbf-wrap">
      <div className="rbf-donewrap rbf-up">
        <div className="rbf-tick">✓</div>
        <span className="rbf-eyebrow">Booking confirmed</span>
        <h1 className="rbf-display" style={{ fontSize: "clamp(28px,3.4vw,42px)", margin: "10px 0 8px" }}>
          {booking.rooms.length > 1 ? "The rooms" : "The room"}
          <br />
          <em>{booking.rooms.length > 1 ? "are yours." : "is yours."}</em>
        </h1>
        <p className="rbf-lede" style={{ margin: "0 auto" }}>
          The desk will call {booking.phone} to confirm. Nothing is charged until you arrive.
        </p>

        <div className="rbf-card rbf-pad rbf-donecard">
          <div className="rbf-done-head">
            <div>
              <span className="rbf-eyebrow" style={{ display: "block" }}>Booking number</span>
              <div className="rbf-ref">{booking.ref}</div>
            </div>
            <Image src={roomOf(booking.rooms[0]).img} alt="" width={200} height={150} sizes="96px" />
          </div>

          <div className="rbf-sum-sep" style={{ marginTop: 14 }}>
            <div className="rbf-selrow">
              <span>{booking.rooms.length > 1 ? "Rooms" : "Room"}</span>
              <b>{booking.rooms.map((id) => roomOf(id).name).join(" · ")}</b>
            </div>
            <div className="rbf-selrow"><span>Check-in</span><b>{prettyDay(booking.checkin)} · from {prettyTime(booking.arrival)}</b></div>
            <div className="rbf-selrow"><span>Check-out</span><b>{prettyDay(booking.checkout)} · by {prettyTime(booking.departure)}</b></div>
            <div className="rbf-selrow"><span>Guests</span><b>{booking.adults} adults{booking.children ? ` · ${booking.children} children` : ""}</b></div>
            <div className="rbf-selrow"><span>Board</span><b>{PACKAGES.find((p) => p.id === booking.pkgId)?.name}</b></div>
            <div className="rbf-selrow"><span>Guest</span><b>{booking.name} · {booking.country}</b></div>
            <div className="rbf-selrow"><span>Free cancellation</span><b>{prettyDay(addDays(booking.checkin, -2))}</b></div>
            <div className="rbf-selrow"><span>Payment</span><b>At the property</b></div>
          </div>
          <div className="rbf-qtot"><span>Total</span><strong>{money(booking.total, booking.cur)}</strong></div>
        </div>

        <div className="rbf-done-actions">
          <button type="button" className="rbf-btn light" onClick={onExit}>
            <span>Back to the start</span>
            <span>‹</span>
          </button>
          <button
            type="button"
            className="rbf-btn"
            onClick={() => {
              setBooking(null);
              setRoomId("");
              setPicked([]);
              setCheckin("");
              setCheckout("");
              setForm((old) => ({ ...old, note: "", agree: false }));
              go("dates");
            }}
          >
            <span>Book another stay</span>
            <span>→</span>
          </button>
        </div>
        <p className="rbf-micro" style={{ marginTop: 14 }}>
          Your details stay in this browser tab — nothing has been sent to the restaurant yet.
        </p>
      </div>
    </div>
  ) : null;

  /* ── the mobile bar: one obvious next step, only where it helps ───────── */
  const mobileBar = (() => {
    // Only where the page's own button can drift out of sight. On the dates
    // step "Your stay" sits right under the calendar and carries its own
    // "See available rooms", so the bar would only cover it a second time.
    // Only where the page's own button can drift out of sight: the room list
    // (the basket sits to one side, below the cards on a phone) and the
    // booking summary. Everywhere else the page carries its own action.
    if (step !== "rooms" && step !== "summary") return null;
    const price = money(stayTotal, cur);
    const sub = `${rooms} ${rooms === 1 ? "room" : "rooms"} · ${nights} ${nights === 1 ? "night" : "nights"}`;
    const ready = step === "rooms" ? fitsEveryone && rooms >= wanted : rooms > 0;
    return (
      <div className="rbf-mbar">
        <div className="rbf-mp"><b>{price}</b><span>{sub}</span></div>
        <button
          type="button"
          className="rbf-btn"
          disabled={!ready}
          onClick={() => go(step === "rooms" ? "summary" : "details")}
        >
          <span>
            {step === "rooms"
              ? rooms < wanted
                ? `Add ${wanted - rooms} more`
                : fitsEveryone
                  ? "Continue"
                  : "Add a room"
              : "Continue"}
          </span>
          <span>→</span>
        </button>
      </div>
    );
  })();

  return (
    <div className="rbf">
      {step === "dates" ? viewDates : null}
      {step === "rooms" ? viewRooms : null}
      {step === "detail" ? viewDetail : null}
      {step === "summary" ? viewSummary : null}
      {step === "details" ? viewDetails : null}
      {step === "done" ? viewDone : null}
      {mobileBar}

      <SignInDialog
        open={signInOpen}
        initialPhone={form.phone}
        intent="stay"
        onClose={() => setSignInOpen(false)}
        onSignedIn={onSignedIn}
      />
    </div>
  );
}
