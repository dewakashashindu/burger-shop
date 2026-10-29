"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATS, DISHES, PACKAGES, PHOTO, ROOMS, money, type Dish, type Room } from "./booking-data";
import RoomStayCalendar, { timeAdjustment } from "./RoomStayCalendar";
import type { MenuSnapshot } from "@/lib/menu-cache";
import type { AvailabilityTable, AvailabilityBooking } from "@/lib/table-availability";
import type { MenuItem } from "@/lib/menu-source";
import type { MenuDish } from "../menu-data";
import { usePathname, useRouter } from "next/navigation";
import { getGuest, refreshGuest, signOut, useGuest } from "../session";
import SignInDialog, { type SignedInCustomer } from "../SignInDialog";

const localNine = (phone: string) =>
  phone.startsWith("0") ? phone : `0${String(phone ?? "").replace(/^\+?94/, "")}`;

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
// Online order slots: 11:00 – 21:30 every 30 minutes (Sri Lanka time).
const ORDER_SLOTS = Array.from({ length: 22 }, (_, i) => {
  const minutes = 11 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const prettyDay = (isoDate: string) => {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Colombo" });
};
const prettyTime = (hhmm: string) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
};
// A reservation is a period, the same pair of columns the POS keeps
// (Tbl_TabelReservation.TimeFrom / TimeTo). Lunch and dinner windows are offered
// from a half-hour grid between opening and closing.
const PERIOD_START = Array.from({ length: 22 }, (_, i) => {
  const minutes = 11 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
// 11:00 → 21:30; a booking may not run past 22:30.
const PERIOD_END = Array.from({ length: 24 }, (_, i) => {
  const minutes = 11 * 60 + (i + 1) * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const PERIOD_LENGTHS = [
  { id: "90", label: "1½ hours" },
  { id: "120", label: "2 hours" },
  { id: "150", label: "2½ hours" },
  { id: "180", label: "3 hours" },
];
/** Adds a length in minutes to an HH:mm start, clamped to 23:59. */
const addMinutes = (hhmm: string, minutes: number) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
// Reading the clock is impure, so it lives outside the component: render stays pure,
// and only the click handlers ever ask for the time.
const nowMs = () => Date.now();
// A short reference for a table/room request — module scope keeps render pure.
const bookingRef = (prefix: "MC-TBL" | "MC-STAY") =>
  `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

const phoneOk = (v: string) => {
  const digits = v.replace(/[\s()-]/g, "");
  return /^(?:\+94|0094|0)?7\d{8}$/.test(digits) || /^\+?\d{9,15}$/.test(digits);
};

// The order page reads the same read-only menu as /menu, so the three levels
// (Category -> L1Des -> L2Des -> dish) behave exactly the same in both places.
//
// The rows are read on the server (lib/menu-cache.ts) and arrive with the HTML:
// the page opens on the dishes the kitchen actually sells, instead of showing a
// made-up list and swapping it under the guest's finger a moment later. The
// make-believe dishes in booking-data.ts are used only when no database has
// been configured at all (a bare clone); a configured database that cannot be
// read is reported honestly and nothing is invented.
type OrderMenu = {
  state: "ok" | "unavailable" | "unconfigured";
  rows: MenuDish[] | null;
};

const toOrderRows = (items: MenuItem[]): MenuDish[] =>
  items.map((item) => ({ ...item, detail: item.description }));

function useLiveOrderMenu(initial?: MenuSnapshot | null): OrderMenu {
  const [menu, setMenu] = useState<OrderMenu>(() => {
    if (initial?.items?.length) return { state: "ok", rows: toOrderRows(initial.items) };
    return { state: initial?.state === "unconfigured" ? "unconfigured" : "unavailable", rows: null };
  });

  useEffect(() => {
    if (initial?.items?.length) return;
    // One quiet retry from the browser; the answer replaces a stale screen.
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/menu/items", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { items?: MenuItem[] } | null) => {
        if (cancelled) return;
        if (Array.isArray(data?.items) && data.items.length) {
          setMenu({ state: "ok", rows: toOrderRows(data.items) });
        } else if (initial?.state !== "unconfigured") {
          setMenu({ state: "unavailable", rows: null });
        }
      })
      .catch(() => {
        /* keep what is on screen */
      });
    return () => { cancelled = true; controller.abort(); };
  }, [initial]);

  return menu;
}

// The day's bookings, read from dbo.Tbl_TabelReservation. Kept keyed by the date
// it belongs to, so a stale answer for yesterday's date is never shown against
// today's — `null` before the first answer, `unavailable` when the book cannot
// be read (the form then keeps its plain area / table dropdowns).
type DayBook = {
  date: string;
  state: "ok" | "unavailable";
  tables: AvailabilityTable[];
  bookings: AvailabilityBooking[];
};

function useDayBook(date: string): DayBook | null {
  const [book, setBook] = useState<DayBook | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/tables/availability?date=${encodeURIComponent(date)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { ok?: boolean; tables?: AvailabilityTable[]; bookings?: AvailabilityBooking[] } | null) => {
        if (cancelled || !data) return;
        setBook({
          date,
          state: data.ok ? "ok" : "unavailable",
          tables: Array.isArray(data.tables) ? data.tables : [],
          bookings: Array.isArray(data.bookings) ? data.bookings : [],
        });
      })
      .catch(() => {
        /* no answer — the fallback dropdowns stay */
      });
    return () => { cancelled = true; controller.abort(); };
  }, [date]);

  return book;
}

// Pickup locations (Tbl_LocationMaster). When the database cannot be read the
// page keeps a neutral single entry instead of inventing branches.
const FALLBACK_LOCATIONS = [{ code: "", name: "Mila Mirissa — the restaurant" }];

function useLocations() {
  const [locations, setLocations] = useState<{ code: string; name: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/locations", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { locations?: { code: string; name: string }[] } | null) => {
        if (!cancelled && Array.isArray(data?.locations) && data.locations.length) setLocations(data.locations);
      })
      .catch(() => {
        /* keep the fallback */
      });
    return () => { cancelled = true; controller.abort(); };
  }, []);
  return locations;
}

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

/**
 * A guest who has filled the form but not yet signed in is sent to the real
 * sign-in screen. Before leaving, the half-built booking is parked in
 * sessionStorage so the very same cart, dates and details come back with them.
 */
const DRAFT_KEY = "microechef-draft";
type PendingConfirm = "table" | "room" | "order";
type SavedDraft = {
  view: View;
  kind: Kind;
  t: unknown;
  r: unknown;
  order: unknown;
  cart: Record<string, number>;
  pending: PendingConfirm | null;
};

function readDraft(): SavedDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SavedDraft) : null;
  } catch {
    return null;
  }
}
function writeDraft(draft: SavedDraft) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* private mode — the guest simply fills the form again */
  }
}
function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
/** "0771234567" / "+94771234567" → the national number the sign-in screen expects. */
function nationalPhone(raw: string) {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+94")) digits = digits.slice(3);
  else if (digits.startsWith("+")) return "";
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/**
 * The floor plan behind the two dropdowns. It is read from /api/tables
 * (Tbl_TableGroup + Tbl_Tables). Until the restaurant database answers, the
 * form keeps the layout that was handed over with the brief.
 */
export type FloorGroup = { id: string; name: string; tableCount: number };
export type FloorTable = { no: string; group: string; groupName: string; vacant: boolean | null; listingOrder: number };
type Floor = { groups: FloorGroup[]; tables: FloorTable[]; locations: { code: string; name: string }[] };

const BUILT_IN_FLOOR: Floor = {
  groups: [
    { id: "001", name: "A. Ground Floor", tableCount: 5 },
    { id: "002", name: "B. First Floor", tableCount: 4 },
  ],
  tables: [
    { no: "T-01", group: "001", groupName: "A. Ground Floor", vacant: true, listingOrder: 10 },
    { no: "T-02", group: "001", groupName: "A. Ground Floor", vacant: true, listingOrder: 20 },
    { no: "T-03", group: "001", groupName: "A. Ground Floor", vacant: true, listingOrder: 30 },
    { no: "T-04", group: "001", groupName: "A. Ground Floor", vacant: true, listingOrder: 40 },
    { no: "T-05", group: "001", groupName: "A. Ground Floor", vacant: true, listingOrder: 50 },
    { no: "T-11", group: "002", groupName: "B. First Floor", vacant: true, listingOrder: 10 },
    { no: "T-12", group: "002", groupName: "B. First Floor", vacant: true, listingOrder: 20 },
    { no: "T-13", group: "002", groupName: "B. First Floor", vacant: true, listingOrder: 30 },
    { no: "T-14", group: "002", groupName: "B. First Floor", vacant: true, listingOrder: 40 },
  ],
  locations: [{ code: "MR", name: "Mirissa" }],
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** A table belongs to a group when its POS value matches either the id or the name. */
const inGroup = (table: FloorTable, group: FloorGroup) =>
  same(table.group, group.id) || same(table.group, group.name) || same(table.groupName, group.name);

// ── availability, worked out from the reservation book ───────────────────────
// One call per date brings the tables and that day's bookings; everything below
// is local arithmetic, so changing the time or the party size is instant.
const minsOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const sameTable = (a: string, b: string) => a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();

/** The booking that already holds this table for some part of the window. */
const clashFor = (bookings: AvailabilityBooking[], tableNo: string, from: string, to: string) =>
  bookings.find((b) => sameTable(b.tableNo, tableNo) && minsOf(b.from) < minsOf(to) && minsOf(b.to) > minsOf(from));

/**
 * Every table of one group, each with the booking that blocks it — or nothing.
 *
 * Party size is deliberately NOT a filter: the guest asked to see the tables in
 * an area, so all of them are listed and only the reservation book decides
 * which ones are unavailable. The seat count is shown for information.
 */
const tablesInGroup = (tables: AvailabilityTable[], group: string) =>
  tables
    .filter((t) => sameTable(t.group, group) || sameTable(t.groupName, group))
    .sort((a, b) => a.listingOrder - b.listingOrder || a.no.localeCompare(b.no));

/** The group's tables with their state for one window. */
const groupAvailability = (
  tables: AvailabilityTable[],
  bookings: AvailabilityBooking[],
  group: string,
  from: string,
  to: string,
) =>
  tablesInGroup(tables, group).map((table) => ({
    table,
    clashes: bookings.filter(
      (b) => sameTable(b.tableNo, table.no) && minsOf(b.from) < minsOf(to) && minsOf(b.to) > minsOf(from),
    ),
  }));

export default function BookingFlow({ start = "choose", menu: initialMenu }: { start?: "choose" | "table" | "rooms" | "order" | "reserve"; menu?: MenuSnapshot | null }) {
  const [view, setView] = useState<View>(start === "order" ? "order" : start === "reserve" ? "reserve" : "choose");
  const [kind, setKind] = useState<Kind>("table");
  const [ref, setRef] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [toast, setToast] = useState("");

  // Sign-in happens at the very end: the guest fills the form first, and only
  // then is sent to the real sign-in screen (/auth/login). Nothing typed here
  // is lost in the meantime — the draft travels with them.
  const guest = useGuest();
  const router = useRouter();
  const pathname = usePathname();
  const [resuming, setResuming] = useState<PendingConfirm | null>(null);
  const resumeFired = useRef(false);
  // The sign-in popup: open over the page, with the booking still behind it.
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInPhone, setSignInPhone] = useState("");
  const [signInIntent, setSignInIntent] = useState("");
  const pendingKind = useRef<PendingConfirm | null>(null);
  const [signedInTick, setSignedInTick] = useState(0);
  // Bumped after a sign-in so the lookup runs again, now with a proven number.
  const [setupTick, setSetupTick] = useState(0);

  const [t, setT] = useState({
    name: "",
    phone: "",
    local: "2",
    foreign: "0",
    date: "",
    // The period the table is held for, plus the table itself.
    from: "",
    to: "",
    group: "",
    tableNo: "",
    note: "",
  });
  const [periodLength, setPeriodLength] = useState("120");
  const [floor, setFloor] = useState<Floor>(BUILT_IN_FLOOR);
  const [floorLive, setFloorLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const guests = Math.max(0, Number(t.local) || 0) + Math.max(0, Number(t.foreign) || 0);
  const activeGroup = floor.groups.find((g) => g.id === t.group || g.name === t.group) ?? null;
  const groupTables = activeGroup
    ? floor.tables.filter((table) => inGroup(table, activeGroup)).sort((a, b) => a.listingOrder - b.listingOrder || a.no.localeCompare(b.no))
    : [];
  const chosenTable = floor.tables.find((table) => table.no === t.tableNo) ?? null;

  // ── Availability: date + time → group → every table in that group ────────
  // The book for the chosen date, then the tables of the chosen area, each with
  // the booking that blocks it. Party size is not used as a filter here: the
  // guest decides with the seat count in front of them. When the book cannot be
  // read at all the form keeps its plain dropdowns, so a bare clone still works.
  const dayBook = useDayBook(t.date);
  const windowTo = t.to || (t.from ? addMinutes(t.from, Number(periodLength)) : "");
  const windowReady = Boolean(t.from && windowTo && minsOf(windowTo) > minsOf(t.from));
  const bookReady = Boolean(t.date) && dayBook?.date === t.date && dayBook.state === "ok";
  const areaValue = activeGroup ? activeGroup.id || activeGroup.name : t.group;
  const groupState =
    bookReady && windowReady && areaValue
      ? groupAvailability(dayBook!.tables, dayBook!.bookings, areaValue, t.from, windowTo)
      : [];
  const freeInGroup = groupState.filter((row) => row.clashes.length === 0);
  // What the booking writes and the guest is told: the group comes with the table.
  const chosenAvailability =
    bookReady && t.tableNo ? dayBook!.tables.find((table) => table.no === t.tableNo) ?? null : null;
  const chosenIsFree = Boolean(
    chosenAvailability &&
      windowReady &&
      !clashFor(dayBook!.bookings, chosenAvailability.no, t.from, windowTo),
  );

  const [r, setR] = useState({
    cat: "all" as "all" | Room["cat"],
    guestType: "local" as "local" | "foreign",
    id: "",
    gallery: 0,
    checkin: "",
    checkout: "",
    // Arrival and departure times — the stay is a date range AND a pair of
    // times; check-in is from 2pm, check-out by 11am unless changed.
    timeIn: "14:00",
    timeOut: "11:00",
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
  // Early arrival / late departure are quoted by the desk, not charged here:
  // the line is shown next to the total so nothing is a surprise on arrival.
  const stayAdj = timeAdjustment(r.timeIn, r.timeOut);

  const [order, setOrder] = useState({
    method: "delivery" as "delivery" | "pickup",
    name: "",
    phone: "",
    address: "",
    note: "",
    // Separate date + time for each method, so switching keeps what was chosen.
    deliveryDate: "",
    deliveryTime: "",
    pickupDate: "",
    pickupTime: "",
    pickupLoc: "",
  });

  // The two dropdowns are filled from the POS floor plan (Tbl_TableGroup +
  // Tbl_Tables). The built-in plan stays in place until that answers.
  useEffect(() => {
    let alive = true;
    fetch("/api/tables")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: null | { ok?: boolean; groups?: FloorGroup[]; tables?: FloorTable[]; locations?: { code: string; name: string }[] }) => {
        if (!alive || !data?.ok || !data.groups?.length) return;
        setFloor({
          groups: data.groups,
          tables: data.tables ?? [],
          locations: data.locations?.length ? data.locations : BUILT_IN_FLOOR.locations,
        });
        setFloorLive(true);
      })
      .catch(() => {
        /* the built-in plan stays — the form still works */
      });
    return () => {
      alive = false;
    };
  }, []);

  const liveLocations = useLocations();
  const locations = liveLocations ?? FALLBACK_LOCATIONS;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState(false);

  // A guest who has already signed in should not type their own name and number
  // again — the fields are filled the moment the tab knows who they are, and
  // anything they have typed themselves is never overwritten.
  useEffect(() => {
    if (!guest) return;
    const phone = guest.phone.startsWith("0") ? guest.phone : `0${guest.phone.replace(/^\+?94/, "")}`;
    const later = guest.name;
    // Deferred one tick so the first paint matches the server exactly.
    const id = window.setTimeout(() => {
      setT((old) => ({ ...old, name: old.name || later || "", phone: old.phone || phone }));
      setOrder((old) => ({ ...old, name: old.name || later || "", phone: old.phone || phone }));
      setR((old) => ({ ...old, name: old.name || later || "", phone: old.phone || phone }));
    }, 0);
    return () => window.clearTimeout(id);
  }, [guest]);
  const [placeError, setPlaceError] = useState("");

  // Same tree as the menu page: top tab, then L1Des cards, then L2Des cards.
  const liveMenu = useLiveOrderMenu(initialMenu);
  // Nothing is invented when the kitchen's list cannot be read: the grid says so.
  const menuUnavailable = liveMenu.state === "unavailable";
  const dishes: Dish[] = useMemo(
    () =>
      liveMenu.rows
        ? liveMenu.rows.map((item) => ({
            id: item.id,
            name: item.name,
            tag: item.subGroup || item.group || item.categoryLabel || "",
            img: item.image,
            price: item.price ?? 0,
            desc: item.description,
            category: item.categoryLabel || item.category,
            group: item.group || "",
            sub: item.subGroup || "",
          }))
        : liveMenu.state === "unconfigured"
          ? DISHES.map((dish) => ({ ...dish, category: "Food", group: "", sub: "" }))
          : [],
    [liveMenu],
  );
  const [orderCat, setOrderCat] = useState("All dishes");
  const [orderGroup, setOrderGroup] = useState("");
  const [orderSub, setOrderSub] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const orderSearchRef = useRef<HTMLInputElement>(null);

  const items = Object.entries(cart).flatMap(([id, qty]) => {
    const dish = dishes.find((d) => d.id === id);
    return dish ? [{ ...dish, qty }] : [];
  });
  const count = items.reduce((a, d) => a + d.qty, 0);
  const subtotal = items.reduce((a, d) => a + d.price * d.qty, 0);
  const delivery = order.method === "delivery" ? 350 : 0;
  const isDelivery = order.method === "delivery";
  const schedDate = isDelivery ? order.deliveryDate : order.pickupDate;
  const schedTime = isDelivery ? order.deliveryTime : order.pickupTime;
  const schedWord = isDelivery ? "delivery" : "pickup";
  const setSchedule = (date: string, time: string) => {
    setOrder((old) => (old.method === "delivery"
      ? { ...old, deliveryDate: date, deliveryTime: time }
      : { ...old, pickupDate: date, pickupTime: time }));
    setErrors((old) => (old.schedule ? { ...old, schedule: "" } : old));
  };
  // Sri Lanka time (UTC+5:30) — the restaurant, not the browser, is the reference.
  // Called from the click handlers only, so rendering stays pure.
  const scheduleProblem = () => {
    if (!schedDate) return `Choose a ${schedWord} date.`;
    if (!schedTime) return `Choose a ${schedWord} time.`;
    const when = new Date(`${schedDate}T${schedTime}:00+05:30`).getTime();
    if (Number.isNaN(when)) return `Choose a valid ${schedWord} date and time.`;
    const floor = nowMs() + 30 * 60 * 1000;
    if (when < floor) return `Please choose a ${schedWord} time at least 30 minutes from now.`;
    return "";
  };
  const scheduleLabel = schedDate && schedTime ? `${prettyDay(schedDate)}, ${prettyTime(schedTime)}` : "";
  // One location needs no choosing; only ask when the restaurant has several.
  const pickupLocation =
    locations.find((location) => location.code === order.pickupLoc) ??
    (locations.length === 1 ? locations[0] : null);
  const pickupLocationName = pickupLocation?.name ?? "";
  // Everything the cart needs before checkout: a schedule and, for pickup, a place.
  const cartProblem = () => {
    const schedMsg = scheduleProblem();
    if (schedMsg) return { field: "schedule" as const, message: schedMsg };
    if (!isDelivery && locations.length > 1 && !pickupLocation) return { field: "location" as const, message: "Choose the restaurant you’ll collect from." };
    return null;
  };

  // ---------------------------------------------------------------- sign in
  const confirmLabel =
    view === "checkout" ? "place this order"
      : view === "table" ? "confirm this table"
        : "confirm this stay";

  /**
   * Asks who is asking — in a popup over the page, not on another screen.
   * The booking stays exactly where it is; once the code checks out the
   * confirmation that was waiting runs by itself.
   */
  const askToSignIn = (pending: PendingConfirm | null, phone: string, label: string) => {
    pendingKind.current = pending;
    setSignInPhone(nationalPhone(phone));
    setSignInIntent(label);
    setSignInOpen(true);
  };

  /**
   * If the number is new, the sign-up screen opens with the booking parked —
   * the draft holds it and `next` carries `?resume=1`, so signing in comes
   * straight back to the confirmation that was waiting.
   */
  const leaveForSignup = () => {
    writeDraft({ view, kind, t, r, order, cart, pending: pendingKind.current });
    const back = `${pathname}${pendingKind.current ? "?resume=1" : ""}`;
    return `/auth/signup?next=${encodeURIComponent(back)}`;
  };

  // ---------------------------------------------------- the book, by phone number
  // Typing a number is the first thing a returning guest does. If this browser
  // has already proved that number, the name and the saved addresses come back
  // from Tbl_CustomerMaster by themselves; if the number has an account but has
  // not been proved here, the form offers one code instead of guessing.
  type BookLookup = { verified: boolean; hasAccount: boolean; name?: string; adds?: string[] };
  const [bookT, setBookT] = useState<BookLookup | null>(null);
  const [bookO, setBookO] = useState<BookLookup | null>(null);
  const [bookR, setBookR] = useState<BookLookup | null>(null);

  const useLookup = (
    phone: string,
    set: (value: BookLookup | null) => void,
  ) => {
    useEffect(() => {
      const nine = nationalPhone(phone).replace(/\D/g, "").slice(-9);
      if (nine.length !== 9) {
        set(null);
        return;
      }
      let alive = true;
      const id = window.setTimeout(async () => {
        try {
          const response = await fetch(`/api/auth/lookup?phone=${nine}`, { cache: "no-store" });
          const data = (await response.json().catch(() => null)) as
            | { ok?: boolean; verified?: boolean; hasAccount?: boolean; customer?: { name?: string; adds?: string[] } }
            | null;
          if (!alive || !data?.ok) return;
          set({
            verified: Boolean(data.verified),
            hasAccount: Boolean(data.hasAccount),
            name: data.customer?.name,
            adds: data.customer?.adds,
          });
        } catch {
          /* offline — the guest simply types their own details */
        }
      }, 420);
      return () => {
        alive = false;
        window.clearTimeout(id);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phone, setupTick]);
  };
  useLookup(t.phone, setBookT);
  useLookup(order.phone, setBookO);
  useLookup(r.phone, setBookR);

  // What the book knows, once it is allowed to say it.
  const savedAdds = (lookup: BookLookup | null) =>
    lookup?.verified ? (lookup.adds ?? []).map((line) => line.trim()).filter(Boolean) : [];

  // Name and address arrive by themselves for a number this browser owns —
  // anything the guest has typed themselves is never overwritten.
  useEffect(() => {
    if (!bookT?.verified) return;
    setT((old) => ({ ...old, name: old.name || bookT.name || "" }));
  }, [bookT]);

  useEffect(() => {
    if (!bookR?.verified) return;
    setR((old) => ({ ...old, name: old.name || bookR.name || "" }));
  }, [bookR]);

  useEffect(() => {
    if (!bookO?.verified) return;
    const first = (bookO.adds ?? []).map((line) => line.trim()).filter(Boolean)[0] ?? "";
    setOrder((old) => ({ ...old, name: old.name || bookO.name || "", address: old.address || first }));
  }, [bookO]);

  /** The one-button way from "this number has an account" to the saved details. */
  const bringDetails = (phone: string, kind: "table" | "order" | "room") => {
    askToSignIn(null, phone, kind === "order" ? "order" : "booking");
    setSetupTick((tick) => tick + 1);
  };

  /** A saved address, chosen with one tap — joined into the address field. */
  const addressLine = (lines: string[]) => lines.join(", ");

  const onSignedIn = (customer: SignedInCustomer) => {
    // The person in the book is the person in the form — fill what is empty.
    const local = localNine(customer.phone);
    setT((old) => ({ ...old, name: old.name || customer.name, phone: old.phone || local }));
    setOrder((old) => ({ ...old, name: old.name || customer.name, phone: old.phone || local }));
    setR((old) => ({ ...old, name: old.name || customer.name, phone: old.phone || local }));
    setSignInOpen(false);
    setSignedInTick((tick) => tick + 1);
    setSetupTick((tick) => tick + 1);
  };

  const signInHint = guest ? null : (
    <p className="signin-hint">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8.2 10.5V8a3.8 3.8 0 1 1 7.6 0v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      You’ll sign in to {confirmLabel} — a code by text, right here in the page.
    </p>
  );
  const signedInLine = guest ? (
    <p className="signed-in">
      Signed in as <b>{guest.phone}</b>
      <button
        type="button"
        className="text-link"
        onClick={() => { void signOut(); }}
      >
        Not you? Sign out
      </button>
    </p>
  ) : null;

  const dishRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const cartRef = useRef<HTMLSpanElement | null>(null);
  // One soft press of the cart badge each time a dish is added (never on first paint).
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    const badge = cartRef.current;
    if (!badge) return;
    if (lastCount.current === null || lastCount.current === count) {
      lastCount.current = count;
      return;
    }
    lastCount.current = count;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    badge.classList.remove("ms-pop");
    void badge.offsetWidth;
    badge.classList.add("ms-pop");
    const id = window.setTimeout(() => badge.classList.remove("ms-pop"), 460);
    return () => window.clearTimeout(id);
  }, [count]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);

  // ---- coming back from /auth/login -------------------------------------
  // The parked booking is put back exactly as it was. If the guest arrived
  // here to confirm something, that confirmation now runs — they already asked
  // for it before signing in. The restore is deferred one tick so the server
  // and the first client paint start from the same, empty tree.
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    clearDraft();
    const id = window.setTimeout(() => {
      if (draft.t) setT((old) => ({ ...old, ...(draft.t as Partial<typeof old>) }));
      if (draft.r) setR((old) => ({ ...old, ...(draft.r as Partial<typeof old>) }));
      if (draft.order) setOrder((old) => ({ ...old, ...(draft.order as Partial<typeof old>) }));
      if (draft.cart) setCart(draft.cart);
      if (draft.kind) setKind(draft.kind);
      if (draft.view) setView(draft.view);
      if (getGuest() && draft.pending) setResuming(draft.pending);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // After the popup closes with a signed-in guest, the confirmation that was
  // waiting runs. The effect fires on the tick so these functions see the new
  // guest from the store, not the empty one they were built with.
  useEffect(() => {
    if (!signedInTick) return;
    const waiting = pendingKind.current;
    if (!waiting) return;
    pendingKind.current = null;
    const id = window.setTimeout(() => {
      if (waiting === "table") void confirmTable();
      else if (waiting === "order") void confirmOrder();
      else confirmRoom();
    }, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInTick]);

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

  const confirmTable = async () => {
    const next: Errors = {};
    if (t.name.trim().length < 2) next.name = "Please enter your name.";
    if (!phoneOk(t.phone)) next.phone = "Enter a valid phone number.";
    if (guests < 1) next.guests = "Add at least one guest (local or foreign).";
    if (!t.date) next.date = "Choose a date.";
    else if (t.date < tomorrow) next.date = "Please choose tomorrow or a later date.";
    if (!t.from) next.from = "Choose when the table starts.";
    if (!t.to) next.to = "Choose when the table is given back.";
    else if (t.from && t.to <= t.from) next.to = "The period has to end after it starts.";
    if (!activeGroup) next.group = "Choose a table group.";
    if (!t.tableNo) next.tableNo = "Choose a table.";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!getGuest()) {
      askToSignIn("table", t.phone, "booking");
      return;
    }

    // The booking is written to dbo.Tbl_TabelReservation — never a local pretend.
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/reserve/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locCode: floor.locations[0]?.code ?? "",
          tableNo: t.tableNo,
          groupName: activeGroup?.name ?? chosenAvailability?.groupName ?? "",
          date: t.date,
          timeFrom: t.from,
          timeTo: t.to,
          pax: guests,
          customerName: t.name.trim(),
          customerPhone: t.phone.trim(),
          note: t.note.trim(),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; resId?: string; message?: string; reason?: string }
        | null;

      if (!response.ok || !data?.ok || !data.resId) {
        setSaveError(
          data?.reason === "not-configured"
            ? "The restaurant’s reservation system isn’t connected here, so this booking was not saved. Your details are still in the form."
            : data?.message
              ? `${data.message} Nothing was saved.`
              : "We couldn’t reach the reservation desk, so this booking was not saved. Please try again in a moment.",
        );
        return;
      }

      setKind("table");
      setRef(`${data.resId} · ${t.tableNo}`);
      setView("success");
    } catch {
      setSaveError("We couldn’t reach the reservation desk, so this booking was not saved. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
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
    if (!getGuest()) {
      askToSignIn("room", r.phone, "booking");
      return;
    }
    setKind("room");
    setRef(bookingRef("MC-STAY"));
    setView("success");
  };

  // The cart is written to dbo.Tbl_holdUpsCloudTempOO. If the database cannot
  // be reached the guest is told plainly — no fake success screen.
  const confirmOrder = async () => {
    const next: Errors = {};
    if (!items.length) next.cart = "Your cart is empty.";
    if (order.name.trim().length < 2) next.name = "Please enter your name.";
    if (!phoneOk(order.phone)) next.phone = "Enter a valid phone number.";
    if (order.method === "delivery" && order.address.trim().length < 8) next.address = "Enter the delivery address.";
    const schedMsg = scheduleProblem();
    if (schedMsg) next.schedule = schedMsg;
    const placeMsg = !isDelivery && locations.length > 1 && !pickupLocation ? "Choose the restaurant you’ll collect from." : "";
    if (placeMsg) next.location = placeMsg;
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!getGuest()) {
      askToSignIn("order", order.phone, "order");
      return;
    }

    setPlacing(true);
    setPlaceError("");
    try {
      const response = await fetch("/api/order/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderType: isDelivery ? "DL" : "PU",
          scheduleDate: schedDate,
          scheduleTime: schedTime,
          // A delivery is not tied to a pickup counter; the server picks the restaurant.
          locCode: isDelivery ? "" : pickupLocation?.code ?? "",
          customerName: order.name.trim(),
          customerPhone: order.phone.trim(),
          customerAddress: order.address.trim(),
          customerLocation: isDelivery ? "" : pickupLocationName,
          orderNote: order.note.trim(),
          items: items.map((line) => ({ itemCode: line.id, qty: line.qty })),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; tabelNo?: string; orderNo?: string; invoiceNo?: string; reason?: string }
        | null;

      if (!response.ok || !data?.ok) {
        setPlaceError(
          data?.message
            ? `${data.message} Nothing was charged and nothing was saved.`
            : "We couldn’t reach the kitchen, so this order was not saved. Please try again in a moment.",
        );
        return;
      }

      // The guest reads the table number and the bill number — the same pair
      // the POS prints: DL-0004 · INV-20261024-004
      setRef([data.tabelNo, data.invoiceNo].filter(Boolean).join(" · "));
      setKind("order");
      setView("success");
    } catch {
      setPlaceError("We couldn’t reach the kitchen, so this order was not saved. Please check your connection and try again.");
    } finally {
      setPlacing(false);
    }
  };

  // The sign-up route takes over when the number is new: the guest creates the
  // account there, signs in, and the browser comes back with `?resume=1`.
  useEffect(() => {
    if (!guest) return;
    let alive = true;
    void (async () => {
      const fresh = await refreshGuest();
      if (!alive || !fresh) return;
      setT((old) => ({ ...old, name: old.name || fresh.name, phone: old.phone || localNine(fresh.phone) }));
      setOrder((old) => ({ ...old, name: old.name || fresh.name, phone: old.phone || localNine(fresh.phone) }));
      setR((old) => ({ ...old, name: old.name || fresh.name, phone: old.phone || localNine(fresh.phone) }));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs once the restored draft has landed in state, so the confirmation sees
  // the guest's own values. `?resume=1` is then dropped from the URL.
  useEffect(() => {
    if (!resuming || resumeFired.current) return;
    resumeFired.current = true;
    const pending = resuming;
    const id = window.setTimeout(() => {
      if (window.location.search.includes("resume=")) {
        window.history.replaceState(null, "", pathname || "/reserve");
      }
      if (pending === "table") confirmTable();
      else if (pending === "room") confirmRoom();
      else void confirmOrder();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per restored draft
  }, [resuming]);

  const addToCart = (id: string) => {
    const dish = dishes.find((d) => d.id === id);
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
            <span className="eyebrow" style={{ color: "#6b5842" }}>A LITTLE PAUSE. A LOVELY MEAL.</span>
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
          <ul className="entry-facts">
            <li>Open 11:00 – 21:30</li>
            <li>Mirissa · Beach Road</li>
            <li>Table · Room · Takeaway</li>
          </ul>
          <p className="micro" style={{ marginTop: 14 }}>You can change your plan at any time.</p>
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
      <div className="pick-grid">
        <button className="pick-card reveal" style={{ ["--d" as string]: "60ms" }} type="button" onClick={() => go("table", "table")}>
          <span className="ph"><Image src={PHOTO.restaurant} alt="The dining room at Mila Mirissa" width={720} height={420} sizes="(max-width:900px) 100vw, 46vw" /></span>
          <span className="body">
            <span className="ic"><TableIcon /></span>
            <strong>Table reservation</strong>
            <span className="txt">Your details, date and time. We hold the table for 15 minutes.</span>
            <span className="meta">2 – 8 guests · about 90 minutes · no card needed</span>
            <span className="go">Reserve a table <Arrow /></span>
          </span>
        </button>
        <button className="pick-card reveal" style={{ ["--d" as string]: "150ms" }} type="button" onClick={() => go("rooms", "room")}>
          <span className="ph"><Image src="/images/room-beach-garden.jpg" alt="Beach garden bungalow at Mila Mirissa" width={720} height={420} sizes="(max-width:900px) 100vw, 46vw" /></span>
          <span className="body">
            <span className="ic"><BedIcon /></span>
            <strong>Room reservation</strong>
            <span className="txt">Garden, family or twin — breakfast included, slow mornings guaranteed.</span>
            <span className="meta">From USD 95 a night · 1 – 4 guests</span>
            <span className="go">See the rooms <Arrow /></span>
          </span>
        </button>
      </div>
      <ul className="entry-facts" style={{ marginTop: 26 }}>
        <li>Open 11:00 – 21:30</li>
        <li>Mirissa · Beach Road</li>
        <li>Table · Room · Takeaway</li>
      </ul>
      <p className="micro" style={{ marginTop: 16 }}>Not sure yet? Ask at the counter — we’ll help you choose.</p>
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
            <Field id="tphone" label="Phone number *" value={t.phone} onChange={(v) => setT({ ...t, phone: v })} placeholder="07X XXX XXXX" inputMode="tel" error={errors.phone} autoComplete="tel" full />
            <Field id="tname" label="Full name *" value={t.name} onChange={(v) => setT({ ...t, name: v })} placeholder={bookT?.verified && bookT.name ? bookT.name : "Fills in from your number"} error={errors.name} autoComplete="name" full />
            {bookT && !bookT.verified && bookT.hasAccount && (
              <p className="book-note full">
                <InfoIcon />
                <span>This number has an account — sign in once and your name comes with it.</span>
                <button type="button" className="text-link" onClick={() => bringDetails(t.phone, "table")}>Bring my details</button>
              </p>
            )}
            <Field id="tdate" label="Date *" type="date" min={tomorrow} value={t.date} onChange={(v) => setT({ ...t, date: v, tableNo: "" })} error={errors.date} />
            <div className="field">
              <label htmlFor="tfrom">Time period *</label>
              <div className="period-row">
                <select
                  id="tfrom"
                  aria-label="Table from"
                  value={t.from}
                  onChange={(e) => {
                    const from = e.target.value;
                    const to = addMinutes(from, Number(periodLength));
                    setT({ ...t, from, to: from ? to : "", tableNo: "" });
                  }}
                  aria-invalid={errors.from ? true : undefined}
                >
                  <option value="">From</option>
                  {PERIOD_START.map((x) => <option key={x} value={x}>{prettyTime(x)}</option>)}
                </select>
                <span className="period-dash" aria-hidden="true">—</span>
                <select
                  id="tto"
                  aria-label="Table until"
                  value={t.to}
                  onChange={(e) => setT({ ...t, to: e.target.value, tableNo: "" })}
                  aria-invalid={errors.to ? true : undefined}
                >
                  <option value="">Until</option>
                  {PERIOD_END.map((x) => <option key={x} value={x}>{prettyTime(x)}</option>)}
                </select>
              </div>
              <div className="period-chips" role="group" aria-label="How long the table is needed">
                {PERIOD_LENGTHS.map((length) => (
                  <button
                    key={length.id}
                    type="button"
                    className={`chip${periodLength === length.id ? " is-on" : ""}`}
                    aria-pressed={periodLength === length.id}
                    onClick={() => {
                      setPeriodLength(length.id);
                      if (t.from) setT({ ...t, to: addMinutes(t.from, Number(length.id)), tableNo: "" });
                    }}
                  >
                    {length.label}
                  </button>
                ))}
              </div>
              {(errors.from || errors.to) && <p className="err" role="alert">{errors.from || errors.to}</p>}
            </div>
            {/* The area question opens only once a date and a period exist —
                that is the order the reservation desk works in. */}
            <div className="field">
              <label htmlFor="tgroup">Table group *</label>
              <select
                id="tgroup"
                value={t.group}
                disabled={!windowReady}
                onChange={(e) => setT({ ...t, group: e.target.value, tableNo: "" })}
                aria-invalid={errors.group ? true : undefined}
              >
                <option value="">{windowReady ? "Choose a group" : "Choose a date and a period first"}</option>
                {floor.groups.map((group) => (
                  <option key={group.id || group.name} value={group.id || group.name}>
                    {group.name}{group.tableCount ? ` · ${group.tableCount} tables` : ""}
                  </option>
                ))}
              </select>
              {errors.group && <p className="err" role="alert">{errors.group}</p>}
              <p className="micro">
                {windowReady
                  ? "Every table in the group is listed next — the reservation book decides which are free."
                  : "The group opens as soon as the date and the time period are chosen."}
              </p>
            </div>

            <div className="field full avail">
              <div className="avail-head">
                <span className="lab" id="avail-label">Your table *</span>
                {!windowReady ? (
                  <span className="chip">Waiting for a date and a time</span>
                ) : !t.date ? (
                  <span className="chip">Choose a date</span>
                ) : !activeGroup ? (
                  <span className="chip">Choose a group</span>
                ) : !bookReady ? (
                  <span className="chip">Checking the reservation book…</span>
                ) : (
                  <>
                    <span className="chip is-free">{freeInGroup.length} free</span>
                    <span className="chip is-full">{groupState.length - freeInGroup.length} booked</span>
                  </>
                )}
              </div>

              {!bookReady ? (
                // ── the book cannot be read: keep the plain table dropdown ──
                <>
                  <select
                    id="ttable"
                    aria-label="Table"
                    value={t.tableNo}
                    onChange={(e) => setT({ ...t, tableNo: e.target.value })}
                    disabled={!activeGroup}
                    aria-invalid={errors.tableNo ? true : undefined}
                  >
                    <option value="">{activeGroup ? "Choose a table" : "Choose a group first"}</option>
                    {groupTables.map((table) => (
                      <option key={table.no} value={table.no}>{table.no}</option>
                    ))}
                  </select>
                  <p className="micro">
                    {activeGroup
                      ? `${groupTables.length} ${groupTables.length === 1 ? "table" : "tables"} in ${activeGroup.name} · the restaurant’s reservation book could not be read, so availability is not shown.`
                      : "Areas and tables come from the restaurant’s floor plan."}
                  </p>
                </>
              ) : !activeGroup ? (
                <p className="avail-ask">
                  Choose a table group above — every table in it is then listed with “free” or the hours it is
                  already booked for.
                </p>
              ) : (
                <>
                  <p className="avail-verdict" role="status">
                    <b>{freeInGroup.length}</b> of {groupState.length}{" "}
                    {groupState.length === 1 ? "table" : "tables"} free in {activeGroup.name} for{" "}
                    {prettyTime(t.from)} – {prettyTime(windowTo)}.
                    <span className="avail-note"> Party size is not used here — pick by the seats shown.</span>
                  </p>
                  <div className="avail-grid" role="group" aria-labelledby="avail-label">
                    {groupState.map(({ table, clashes: hits }) => {
                      const booked = hits.length > 0;
                      return (
                        <button
                          key={table.no}
                          type="button"
                          className="avail-t"
                          data-off={booked ? "true" : "false"}
                          aria-pressed={t.tableNo === table.no}
                          onClick={() => {
                            if (!booked) setT({ ...t, tableNo: table.no, group: areaValue });
                          }}
                        >
                          <span className="top">
                            <span className="no">{table.no}</span>
                            {table.seats !== null && <span className="seats">seats {table.seats}</span>}
                          </span>
                          {booked ? (
                            <span className="state off">
                              Booked {hits.map((h) => `${h.from}–${h.to}`).join(", ")}
                            </span>
                          ) : (
                            <span className="state">Free {prettyTime(t.from)} – {prettyTime(windowTo)}</span>
                          )}
                          <span className="why">
                            {booked
                              ? hits.map((h) => `overlaps: ${h.from} < ${t.to || windowTo} and ${h.to} > ${t.from}`).join(" · ")
                              : "no booking touches this window"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {t.tableNo && (
                <p className="avail-chosen">
                  {chosenIsFree ? (
                    <>
                      Chosen: <b>{t.tableNo}</b>
                      {chosenAvailability?.groupName ? ` · ${chosenAvailability.groupName}` : ""} ·{" "}
                      {prettyTime(t.from)} – {prettyTime(windowTo)}
                      <button type="button" className="text-link" onClick={() => setT({ ...t, tableNo: "" })}>
                        Change
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="warn">{t.tableNo} is no longer free for this window.</span>
                      <button type="button" className="text-link" onClick={() => setT({ ...t, tableNo: "" })}>
                        Choose another
                      </button>
                    </>
                  )}
                </p>
              )}
              {errors.tableNo && <p className="err" role="alert">{errors.tableNo}</p>}
              <p className="micro">
                Read from the reservation book itself — a table is blocked when a booking’s hours overlap your
                period, not only when the start times match.
              </p>
            </div>
            <div className="field">
              <label htmlFor="tlocal">Local guests *</label>
              <div className="guest-stepper">
                <button type="button" aria-label="One fewer local guest" onClick={() => setT({ ...t, local: String(Math.max(0, (Number(t.local) || 0) - 1)), tableNo: "" })}>−</button>
                <input id="tlocal" type="number" inputMode="numeric" min="0" max="200" step="1" value={t.local} onChange={(e) => setT({ ...t, local: e.target.value, tableNo: "" })} aria-invalid={errors.guests ? true : undefined} />
                <button type="button" aria-label="One more local guest" onClick={() => setT({ ...t, local: String(Math.min(200, (Number(t.local) || 0) + 1)), tableNo: "" })}>+</button>
              </div>
              <p className="micro">Guests living in Sri Lanka.</p>
            </div>
            <div className="field">
              <label htmlFor="tforeign">Foreign guests</label>
              <div className="guest-stepper">
                <button type="button" aria-label="One fewer foreign guest" onClick={() => setT({ ...t, foreign: String(Math.max(0, (Number(t.foreign) || 0) - 1)), tableNo: "" })}>−</button>
                <input id="tforeign" type="number" inputMode="numeric" min="0" max="200" step="1" value={t.foreign} onChange={(e) => setT({ ...t, foreign: e.target.value, tableNo: "" })} />
                <button type="button" aria-label="One more foreign guest" onClick={() => setT({ ...t, foreign: String(Math.min(200, (Number(t.foreign) || 0) + 1)), tableNo: "" })}>+</button>
              </div>
              <p className="micro">Visiting from abroad.</p>
            </div>
            <div className="field full guest-total">
              <span className="lab">Total guests</span>
              <b>{guests}</b>
              <p className="micro">Type any number you need — there’s no fixed limit. For larger parties, add a note below.</p>
              {errors.guests && <p className="err" role="alert" style={{ flexBasis: "100%" }}>{errors.guests}</p>}
            </div>
            <TextArea id="tnote" label="Special requests" value={t.note} onChange={(v) => setT({ ...t, note: v })} placeholder="Allergies, a birthday, a high chair, anything else we should know…" />
          </div>
          <p className="micro" style={{ margin: "4px 0 0" }}>Please mention any allergies or dietary needs in the special requests box.</p>
          {signInHint}
          {signedInLine}
          {saveError && <p className="err save-error" role="alert">{saveError}</p>}
          <div className="actions">
            <span className="note">Your table is held for 15 minutes from the start of the period.</span>
            <button
              className="btn"
              type="button"
              onClick={confirmTable}
              disabled={saving}
              data-busy={saving ? "true" : "false"}
              aria-busy={saving}
            >
              <span className="btn-label">{saving ? "Saving your table…" : "Confirm reservation"}</span> <Arrow />
              <span className="btn-spin" aria-hidden="true"><i /></span>
            </button>
          </div>
        </section>
        {summary(
          <>
            <h4>Dinner at Mila Mirissa</h4>
            <div className="sum-line"><span>Guest</span><b>{t.name || "—"}</b></div>
            <div className="sum-line"><span>Date</span><b>{t.date || "—"}</b></div>
            <div className="sum-line"><span>Period</span><b>{t.from && t.to ? `${prettyTime(t.from)} – ${prettyTime(t.to)}` : "—"}</b></div>
            <div className="sum-line"><span>Guests</span><b>{t.local} local · {t.foreign} foreign</b></div>
            <div className="sum-line"><span>Area</span><b>{activeGroup?.name || "—"}</b></div>
            <div className="sum-line"><span>Table</span><b>{chosenTable ? `${chosenTable.no}${chosenTable.vacant === false ? " · occupied" : ""}` : "—"}</b></div>
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
          <h3>Your dates &amp; times</h3>
          <div style={{ marginTop: 14 }}>
            <RoomStayCalendar
              checkin={r.checkin}
              checkout={r.checkout}
              timeIn={r.timeIn}
              timeOut={r.timeOut}
              error={errors.checkin || errors.checkout}
              onChange={(patch) => setR((old) => ({ ...old, ...patch }))}
            />
          </div>
          <div className="form-grid" style={{ marginTop: 18 }}>
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
            <Field id="rphone" label="Phone number" value={r.phone} onChange={(v) => setR({ ...r, phone: v })} placeholder="07X XXX XXXX" inputMode="tel" error={errors.phone} autoComplete="tel" full />
            <Field id="rname" label="Full name" value={r.name} onChange={(v) => setR({ ...r, name: v })} placeholder={bookR?.verified && bookR.name ? bookR.name : "Fills in from your number"} error={errors.name} autoComplete="name" full />
            {bookR && !bookR.verified && bookR.hasAccount && (
              <p className="book-note full">
                <InfoIcon />
                <span>This number has an account — sign in once and your name comes with it.</span>
                <button type="button" className="text-link" onClick={() => bringDetails(r.phone, "room")}>Bring my details</button>
              </p>
            )}
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
          {signInHint}
          {signedInLine}
          <div className="actions">
            <button className="text-link" type="button" onClick={() => go("room")}><Left /> Back to room</button>
            <button className="btn" type="button" onClick={confirmRoom}>Confirm stay <Arrow /></button>
          </div>
        </section>
        {summary(
          <>
            <div className="sum-line"><span>Check-in</span><b>{r.checkin ? `${prettyDay(r.checkin)} · ${prettyTime(r.timeIn)}` : "—"}</b></div>
            <div className="sum-line"><span>Check-out</span><b>{r.checkout ? `${prettyDay(r.checkout)} · ${prettyTime(r.timeOut)}` : "—"}</b></div>
            {Boolean(stayAdj.early || stayAdj.latePct) && r.checkin && (
              <div className="sum-line"><span>{stayAdj.early ? "Early arrival" : "Late departure"}</span><b>quoted by the desk</b></div>
            )}
            <div className="sum-line"><span>Guests</span><b>{r.guests}</b></div>
            <div className="sum-line"><span>Package</span><b>{stayPkg.name}</b></div>
            <div className="sum-line"><span>Rate · {cur === "LKR" ? "local" : "foreign"} guest</span><b>{money(roomRate, cur)}</b></div>
            <div className="sum-total"><span>Total</span><strong>{nights ? money(roomTotal, cur) : "—"}</strong></div>
          </>,
          <><span>{room.name}</span><span>{nights || 0} {nights === 1 ? "night" : "nights"}</span></>,
          [stayAdj.note, "Rates are indicative. No payment is taken on this website."].filter(Boolean).join(" "),
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
          {scheduleLabel && (
            <div className="fee-line"><span>{isDelivery ? "Delivery time" : "Pickup time"}</span><span>{scheduleLabel}</span></div>
          )}
          {!isDelivery && pickupLocationName && (
            <div className="fee-line"><span>Pickup from</span><span>{pickupLocationName}</span></div>
          )}
          <div className="sum-total"><span>Total</span><strong>{money(subtotal + delivery, "LKR")}</strong></div>
          <button className="btn block" style={{ marginTop: 16 }} type="button" onClick={() => go("cart")}>Review cart <Arrow /></button>
        </>
      ) : (
        <p className="micro">Your cart is empty. Add a dish to begin.</p>
      )}
      <div className="delivery-note">
        <InfoIcon />
        <span>{isDelivery
          ? scheduleLabel
            ? `Delivery requested for ${scheduleLabel}. We’ll call to confirm.`
            : "Choose a delivery date and time in the cart. Delivery takes 35–45 minutes once the kitchen accepts your order."
          : scheduleLabel
            ? `Pickup requested for ${scheduleLabel}${pickupLocationName ? ` at ${pickupLocationName}` : ""}. Ready at the counter.`
            : "Choose a pickup date and time in the cart. Pickup is usually ready in 25–30 minutes."}</span>
      </div>
    </aside>
  );

  // ── order menu tree (Category -> L1Des -> L2Des -> dish) ──────────────────
  const orderCats = ["All dishes", ...Array.from(new Set(dishes.map((d) => d.category || "Food")))];
  const activeCat = orderCats.includes(orderCat) ? orderCat : "All dishes";
  const orderInCat = activeCat === "All dishes" ? dishes : dishes.filter((d) => (d.category || "Food") === activeCat);
  const orderGroupNames = activeCat === "All dishes" ? [] : Array.from(new Set(orderInCat.map((d) => d.group || "").filter(Boolean)));
  // The search looks through the open category (All dishes = everything), the
  // same rule the menu page follows: never just the level you are standing on.
  const orderQuery = orderSearch.trim().toLocaleLowerCase();
  const orderHit = (d: Dish) =>
    [d.name, d.desc, d.tag, d.category, d.group, d.sub]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(orderQuery);
  const orderInGroup = orderGroup ? orderInCat.filter((d) => d.group === orderGroup) : orderInCat;
  const orderSubNames = orderGroup ? Array.from(new Set(orderInGroup.map((d) => d.sub || "").filter(Boolean))) : [];
  const buildCollection = (name: string, rows: Dish[], subCount: number) => ({
    name,
    count: rows.length,
    subCount,
    cover: rows[0],
    names: rows.slice(0, 3).map((d) => d.name).join(", ") + (rows.length > 3 ? ` + ${rows.length - 3} more` : ""),
    meta: [subCount ? `${subCount} sub ${subCount === 1 ? "category" : "categories"}` : "", `${rows.length} ${rows.length === 1 ? "dish" : "dishes"}`].filter(Boolean).join(" · "),
  });
  let orderCollections: ReturnType<typeof buildCollection>[] = [];
  let orderVisible: Dish[];
  if (orderQuery) {
    orderVisible = orderInCat.filter(orderHit);
  } else if (activeCat === "All dishes") {
    orderVisible = dishes;
  } else if (!orderGroup) {
    orderCollections = orderGroupNames.map((name) => {
      const rows = orderInCat.filter((d) => d.group === name);
      return buildCollection(name, rows, new Set(rows.map((d) => d.sub || "").filter(Boolean)).size);
    });
    orderVisible = orderInCat.filter((d) => !d.group);
  } else if (!orderSub) {
    orderCollections = orderSubNames.map((name) => buildCollection(name, orderInGroup.filter((d) => d.sub === name), 0));
    orderVisible = orderInGroup.filter((d) => !d.sub);
  } else {
    orderVisible = orderInGroup.filter((d) => d.sub === orderSub);
  }
  const orderStatusText = orderQuery
    ? `${orderVisible.length} ${orderVisible.length === 1 ? "dish" : "dishes"} matching “${orderSearch.trim()}”`
    : [
    orderCollections.length ? `${orderCollections.length} sub ${orderCollections.length === 1 ? "category" : "categories"}` : "",
    orderVisible.length ? `${orderVisible.length} ${orderVisible.length === 1 ? "dish" : "dishes"}${orderSub ? ` in ${orderSub}` : orderGroup ? ` in ${orderGroup}` : activeCat !== "All dishes" ? ` in ${activeCat}` : ""}` : (orderCollections.length ? `${orderInCat.length} dishes in ${activeCat}` : ""),
  ].filter(Boolean).join(" · ");

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
      <div className="wm-category-panel order-panel">
        <p className="eyebrow">Explore the menu</p>
        <div className="wm-category-list" role="group" aria-label="Filter the order menu by category">
          {orderCats.map((c) => (
            <button key={c} type="button" aria-pressed={activeCat === c} onClick={() => { setOrderCat(c); setOrderGroup(""); setOrderSub(""); setOrderSearch(""); }}>
              {c}<span>{c === "All dishes" ? dishes.length : dishes.filter((d) => (d.category || "Food") === c).length}</span>
            </button>
          ))}
        </div>
        <label className="wm-search order-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.5" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5" /></svg>
          <input
            ref={orderSearchRef}
            type="search"
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") setOrderSearch(""); }}
            aria-label="Search the order menu"
            placeholder="Search the menu…"
            autoComplete="off"
          />
          {orderSearch && <button type="button" aria-label="Clear search" onClick={() => { setOrderSearch(""); orderSearchRef.current?.focus(); }}>×</button>}
        </label>
      </div>
      {activeCat !== "All dishes" && (
        <div className="order-path" aria-label="Menu path">
          <button type="button" onClick={() => { setOrderCat("All dishes"); setOrderGroup(""); setOrderSub(""); setOrderSearch(""); }}>All dishes</button>
          <i aria-hidden="true">/</i>
          {orderGroup
            ? <button type="button" onClick={() => { setOrderGroup(""); setOrderSub(""); }}>{activeCat}</button>
            : <span>{activeCat}</span>}
          {orderGroup && (<>
            <i aria-hidden="true">/</i>
            {orderSub
              ? <button type="button" onClick={() => setOrderSub("")}>{orderGroup}</button>
              : <span>{orderGroup}</span>}
          </>)}
          {orderSub && (<><i aria-hidden="true">/</i><span>{orderSub}</span></>)}
        </div>
      )}
      <p className="order-status micro" role="status">{orderStatusText}</p>
      <div className="cart-layout">
        <div className="order-grid">
          {menuUnavailable && (
            <div className="order-empty">
              <span className="eyebrow">The kitchen’s list is out of reach</span>
              <h3>We can’t show the menu.</h3>
              <p>
                Dishes and prices always come from the restaurant, so nothing is listed rather than
                something that might be wrong. Call <a href="tel:0772336233">077 233 6233</a> to order,
                or try again in a moment.
              </p>
              <button type="button" className="btn" onClick={() => { window.location.reload(); }}>
                Try again <Arrow />
              </button>
            </div>
          )}
          {orderQuery && !orderVisible.length && (
            <div className="order-empty">
              <span className="eyebrow">Nothing by that name</span>
              <h3>A little different, perhaps?</h3>
              <p>
                No dishes match “{orderSearch.trim()}”{activeCat !== "All dishes" ? ` in ${activeCat}` : ""}. Try another
                word, or look through every dish on the menu.
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => { setOrderCat("All dishes"); setOrderGroup(""); setOrderSub(""); setOrderSearch(""); orderSearchRef.current?.focus(); }}
              >
                Show all {dishes.length} dishes <Arrow />
              </button>
            </div>
          )}
          {orderCollections.map((c) => (
            <article
              className="dish is-coll"
              key={`coll-${c.name}`}
              role="button"
              tabIndex={0}
              aria-label={`Open ${c.name}, ${c.meta}`}
              onClick={() => { if (orderGroup) setOrderSub(c.name); else { setOrderGroup(c.name); setOrderSub(""); } }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (orderGroup) setOrderSub(c.name); else { setOrderGroup(c.name); setOrderSub(""); }
                }
              }}
            >
              <div className="ph">
                <Image src={c.cover.img} alt={c.name} width={1200} height={746} sizes="(max-width:767px) 100vw, 33vw" />
                <span className="tag">{c.count} {c.count === 1 ? "dish" : "dishes"}</span>
              </div>
              <div className="body">
                <span className="eyebrow">SUB CATEGORY</span>
                <h3>{c.name}</h3>
                <p>{c.names}</p>
                <div className="foot">
                  <span className="micro">{c.meta}</span>
                  <span className="coll-open" aria-hidden="true"><Arrow /></span>
                </div>
              </div>
            </article>
          ))}
          {orderVisible.map((d, i) => (
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
          <section className="panel sched reveal" aria-labelledby="sched-title">
            <div className="sched-head">
              <div>
                <span className="eyebrow">WHEN</span>
                <h3 id="sched-title">{isDelivery ? "Delivery date & time" : "Pickup date & time"}</h3>
              </div>
              <div className="seg" role="group" aria-label="Delivery or pickup" style={{ borderRadius: 8 }}>
                <button type="button" style={{ borderRadius: 5 }} aria-pressed={isDelivery} onClick={() => { setOrder({ ...order, method: "delivery" }); setErrors({}); }}>Delivery</button>
                <button type="button" style={{ borderRadius: 5 }} aria-pressed={!isDelivery} onClick={() => { setOrder({ ...order, method: "pickup" }); setErrors({}); }}>Pickup</button>
              </div>
            </div>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <Field
                id="ordDate"
                label={isDelivery ? "Delivery date" : "Pickup date"}
                type="date"
                min={today}
                value={schedDate}
                onChange={(v) => setSchedule(v, schedTime)}
              />
              <div className="field">
                <label htmlFor="ordTime">{isDelivery ? "Delivery time" : "Pickup time"}</label>
                <select id="ordTime" className="slot-select" value={schedTime} onChange={(e) => setSchedule(schedDate, e.target.value)} aria-invalid={errors.schedule ? true : undefined}>
                  <option value="">Choose a time</option>
                  {ORDER_SLOTS.map((slot) => <option key={slot} value={slot}>{prettyTime(slot)}</option>)}
                </select>
              </div>
            </div>
            {!isDelivery && locations.length > 1 && (
              <div className="field loc-field">
                <label htmlFor="ordLoc">Pickup location</label>
                <select
                  id="ordLoc"
                  className="slot-select"
                  value={pickupLocation?.code ?? ""}
                  onChange={(e) => { setOrder({ ...order, pickupLoc: e.target.value }); setErrors((old) => ({ ...old, location: "" })); }}
                  aria-invalid={errors.location ? true : undefined}
                >
                  <option value="">Choose a restaurant</option>
                  {locations.map((location) => (
                    <option key={location.code} value={location.code}>{location.name}</option>
                  ))}
                </select>
                {errors.location && <p className="err" role="alert">{errors.location}</p>}
              </div>
            )}
            <p className="micro sched-note">
              {isDelivery
                ? "We deliver between 11:00 and 21:30. Choose a time at least 30 minutes from now."
                : "Collect from the restaurant counter, 11:00 – 21:30. Choose a time at least 30 minutes from now."}
            </p>
            {errors.schedule && <p className="err" role="alert">{errors.schedule}</p>}
          </section>
          <div className="actions">
            <button className="text-link" type="button" onClick={() => go("order")}><Left /> Add more dishes</button>
            {items.length > 0 && (
              <button className="btn" type="button" onClick={() => { const problem = cartProblem(); if (problem) { setErrors({ [problem.field]: problem.message }); return; } setErrors({}); go("checkout"); }}>
                Continue to checkout <Arrow />
              </button>
            )}
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
          <div className="sched-readout">
            <span><ClockIcon />{isDelivery ? "Delivery" : "Pickup"} · <b>{scheduleLabel || "date and time not chosen"}</b>{!isDelivery && pickupLocationName ? ` · ${pickupLocationName}` : ""}</span>
            <button type="button" className="text-link" onClick={() => go("cart")}>Change</button>
          </div>
          {errors.location && <p className="err" role="alert">{errors.location}</p>}
          <div className="form-grid">
            <Field id="ophone" label="Phone number" value={order.phone} onChange={(v) => setOrder({ ...order, phone: v })} placeholder="07X XXX XXXX" inputMode="tel" error={errors.phone} autoComplete="tel" full />
            <Field id="oname" label="Full name" value={order.name} onChange={(v) => setOrder({ ...order, name: v })} placeholder={bookO?.verified && bookO.name ? bookO.name : "Fills in from your number"} error={errors.name} autoComplete="name" full />
            {order.method === "delivery" ? (
              <>
                <Field id="oaddr" label="Delivery address" value={order.address} onChange={(v) => setOrder({ ...order, address: v })} placeholder="House, street, area" error={errors.address} full />
                {savedAdds(bookO).length > 0 && (
                  <div className="addr-picks full">
                    <span className="addr-picks-key"><PinIcon /> Saved addresses</span>
                    <div className="addr-picks-row">
                      {savedAdds(bookO).map((line, index) => (
                        <button
                          key={line}
                          type="button"
                          className="addr-chip"
                          aria-pressed={order.address === line}
                          onClick={() => setOrder({ ...order, address: line })}
                        >
                          <b>{index + 1}</b>{line}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="field full">
                <label htmlFor="oaddr">Pickup</label>
                <input id="oaddr" value={pickupLocationName || "Mila Mirissa, restaurant counter"} readOnly />
              </div>
            )}
            <TextArea id="onote" label="Notes for the kitchen" value={order.note} onChange={(v) => setOrder({ ...order, note: v })} placeholder="Spice level, allergies, gate code…" />
          </div>
          {bookO && !bookO.verified && bookO.hasAccount && (
            <p className="book-note">
              <InfoIcon />
              <span>This number has an account — sign in once and your name and saved addresses come with it.</span>
              <button type="button" className="text-link" onClick={() => bringDetails(order.phone, "order")}>Bring my details</button>
            </p>
          )}
          {errors.cart && <p className="err" role="alert">{errors.cart}</p>}
          {placeError && <p className="err" role="alert">{placeError}</p>}
          {signInHint}
          {signedInLine}
          <div className="actions">
            <button className="text-link" type="button" onClick={() => go("cart")} disabled={placing}><Left /> Back to cart</button>
            <button
              className="btn"
              type="button"
              onClick={confirmOrder}
              disabled={placing}
              data-busy={placing ? "true" : "false"}
              aria-busy={placing}
            >
              <span className="btn-label">{placing ? "Saving your order…" : `Place order · ${money(subtotal + delivery, "LKR")}`}</span> <Arrow />
              <span className="btn-spin" aria-hidden="true"><i /></span>
            </button>
          </div>
        </section>
        {summary(
          <>
            {items.map((d) => (
              <div className="sum-line" key={d.id}><span>{d.qty} × {d.name}</span><b>{money(d.price * d.qty, "LKR")}</b></div>
            ))}
            <div className="sum-line"><span>Subtotal</span><b>{money(subtotal, "LKR")}</b></div>
            <div className="sum-line"><span>{isDelivery ? "Delivery" : "Pickup"}</span><b>{isDelivery ? money(delivery, "LKR") : "Free"}</b></div>
            <div className="sum-line"><span>{isDelivery ? "Delivery time" : "Pickup time"}</span><b>{scheduleLabel || "Not chosen"}</b></div>
            {!isDelivery && <div className="sum-line"><span>Pickup from</span><b>{pickupLocationName || "Not chosen"}</b></div>}
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
            ? `Thank you, ${order.name.split(" ")[0] || "friend"}. ${isDelivery ? "Delivery" : "Pickup"} for ${scheduleLabel || "your chosen time"}${!isDelivery && pickupLocationName ? ` at ${pickupLocationName}` : ""}. The kitchen will call ${order.phone} to confirm.`
            : kind === "room"
              ? `${r.name.split(" ")[0] || "Guest"}, we’ve noted your stay — in on ${prettyDay(r.checkin)} from ${prettyTime(r.timeIn)}, out on ${prettyDay(r.checkout)} by ${prettyTime(r.timeOut)}.`
              : `Thank you, ${t.name.split(" ")[0] || "friend"}. ${t.tableNo} is yours from ${prettyTime(t.from)} to ${prettyTime(t.to)} on ${prettyDay(t.date)} for ${guests} ${guests === 1 ? "guest" : "guests"}.`}
        </p>
        <p className="micro">
          {kind === "order"
            ? "Your order is saved in the restaurant’s system. The kitchen will call to confirm."
            : kind === "table"
              ? "Your table is saved in the restaurant’s reservation book. We’ll call to confirm."
              : "Your details stay in this browser tab — nothing has been sent to the restaurant yet."}
        </p>
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
          <Link className="brand" href="/" aria-label="Mila Mirissa home">Mila Mirissa<small>KITCHEN &amp; GOOD COMPANY</small></Link>
          <div className="head-right">
            {showCart && (
              <button className="cart-btn" type="button" onClick={() => go("cart")} aria-label={`Open cart, ${count} ${count === 1 ? "item" : "items"}`}>
                <BagIcon /><span>Cart</span><span className="cart-count" ref={cartRef}>{count}</span>
              </button>
            )}
            <button className="ghost-link" type="button" onClick={() => go("choose")}>Start again</button>
            <Link className="head-logo" href="/" aria-label="Mila Mirissā — home" title="Mila Mirissā">
              <span className="head-logo-name">Mila Mirissā</span>
              <Image className="head-logo-img" src="/images/mila-mirissa-logo-sm.png" alt="" width={88} height={88} />
            </Link>
          </div>
        </div>
      </header>
      <div id="reserve-main">{body}</div>
      <SignInDialog
        open={signInOpen}
        initialPhone={signInPhone}
        intent={signInIntent}
        onClose={() => setSignInOpen(false)}
        onSignedIn={onSignedIn}
        signupHref={`/auth/signup?next=${encodeURIComponent(pathname || "/reserve")}`}
        onLeavingForSignup={leaveForSignup}
      />
      <div className={`toast${toast ? " show" : ""}`} role="status">{toast}</div>
    </div>
  );
}
