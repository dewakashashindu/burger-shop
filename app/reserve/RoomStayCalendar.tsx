"use client";

/**
 * RoomStayCalendar — the big range calendar for a room stay, in the
 * "Editorial cream" skin the rest of /reserve already uses.
 *
 * The guest taps the check-in day, then the check-out day, and every night in
 * between is selected at once. Arrival and departure TIMES are chosen on the
 * same panel (check-in from 2pm, check-out by 11am by default).
 *
 * UI only: this component owns nothing but the four values it is given.
 * Availability (`booked`) is a prop — an empty list today, so the calendar
 * behaves exactly like the rest of the room form until a room-availability
 * endpoint feeds it.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import "./room-stay-calendar.css";

export type BookedRange = {
  /** YYYY-MM-DD — first night held (check-in day). */
  from: string;
  /** YYYY-MM-DD — exclusive; the stay covers every night before this day. */
  to: string;
};

export type StayPatch = {
  checkin?: string;
  checkout?: string;
  timeIn?: string;
  timeOut?: string;
};

export const STD_CHECK_IN = "14:00";
export const STD_CHECK_OUT = "11:00";
export const CHECK_IN_TIMES = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];
export const CHECK_OUT_TIMES = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
const MAX_NIGHTS = 30;
const MAX_MONTHS_AHEAD = 12;

/* ── Sri Lanka dates (the restaurant's day is Asia/Colombo, not UTC) ───── */
// A stable no-op store: the calendar only needs "what day is it in Colombo",
// read on the client so the server and the browser can never disagree across
// midnight (Sri Lanka is UTC+5:30). The server snapshot is empty, so a
// server-rendered calendar simply shows no past days until it hydrates.
const noSubscribe = () => () => {};
const SL_TODAY = () => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};
const toISO = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
};
const diffDays = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 864e5);
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
const firstWeekday = (year: number, month: number) => new Date(Date.UTC(year, month, 1, 12)).getUTCDay();

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function prettyDay(iso: string) {
  if (!iso) return "—";
  const d = toDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

export function prettyTime(hhmm: string) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Early arrival / late departure" wording for the chosen times, if any. */
export function timeAdjustment(timeIn: string, timeOut: string) {
  const early = Boolean(timeIn && timeIn < STD_CHECK_IN);
  const latePct = timeOut > "13:00" ? 50 : timeOut > STD_CHECK_OUT ? 25 : 0;
  return {
    early,
    latePct,
    note: early
      ? `Arrival before ${prettyTime(STD_CHECK_IN)} may be charged 25% of one night.`
      : latePct
        ? `Departure after ${prettyTime(STD_CHECK_OUT)} may be charged ${latePct}% of one night.`
        : "",
  };
}

export default function RoomStayCalendar({
  checkin,
  checkout,
  timeIn = STD_CHECK_IN,
  timeOut = STD_CHECK_OUT,
  booked = [],
  error,
  onChange,
}: {
  checkin: string;
  checkout: string;
  timeIn?: string;
  timeOut?: string;
  booked?: BookedRange[];
  error?: string;
  onChange: (patch: StayPatch) => void;
}) {
  const today = useSyncExternalStore(noSubscribe, SL_TODAY, () => "");

  const [cursor, setCursor] = useState(() => {
    const base = checkin || SL_TODAY();
    const d = toDate(base);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const [msg, setMsg] = useState("");

  const nights = checkin && checkout && checkout > checkin ? diffDays(checkin, checkout) : 0;

  const heldNights = useMemo(() => {
    const set = new Set<string>();
    booked.forEach((range) => {
      if (!range.from || !range.to) return;
      for (let day = range.from; day < range.to; day = addDays(day, 1)) set.add(day);
    });
    return set;
  }, [booked]);

  const isHeld = (iso: string) => heldNights.has(iso);
  const firstHeldIn = (from: string, to: string) => {
    for (let day = from; day < to; day = addDays(day, 1)) if (isHeld(day)) return day;
    return "";
  };

  const canGoBack = useMemo(() => {
    if (!today) return true;
    const t = toDate(today);
    return cursor.year > t.getUTCFullYear() || (cursor.year === t.getUTCFullYear() && cursor.month > t.getUTCMonth());
  }, [cursor, today]);

  const canGoForward = useMemo(() => {
    if (!today) return true;
    const t = toDate(today);
    const months = (cursor.year - t.getUTCFullYear()) * 12 + (cursor.month - t.getUTCMonth());
    return months < MAX_MONTHS_AHEAD;
  }, [cursor, today]);

  const shiftMonth = (delta: number) => {
    setMsg("");
    setCursor((old) => {
      const raw = old.year * 12 + old.month + delta;
      return { year: Math.floor(raw / 12), month: ((raw % 12) + 12) % 12 };
    });
  };

  const pick = (iso: string) => {
    setMsg("");
    // no start yet, or a finished range → begin a new one
    if (!checkin || checkout) {
      onChange({ checkin: iso, checkout: "" });
      return;
    }
    if (iso <= checkin) {
      onChange({ checkin: iso, checkout: "" });
      return;
    }
    if (diffDays(checkin, iso) > MAX_NIGHTS) {
      setMsg(`A single stay can be up to ${MAX_NIGHTS} nights — choose an earlier check-out.`);
      return;
    }
    const clash = firstHeldIn(checkin, iso);
    if (clash) {
      setMsg(`${prettyDay(clash)} is already taken. Choose a check-out before it, or start after it.`);
      return;
    }
    onChange({ checkout: iso });
  };

  const hint = !checkin ? "Tap the check-in day." : !checkout ? "Now tap the check-out day — the nights in between light up together." : "Tap any day to start a new stay.";

  const total = daysInMonth(cursor.year, cursor.month);
  const lead = firstWeekday(cursor.year, cursor.month);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => toISO(new Date(Date.UTC(cursor.year, cursor.month, i + 1, 12)))),
  ];

  const freeThisMonth = cells.reduce((count, iso) => {
    if (!iso) return count;
    if (today && iso < today) return count;
    return isHeld(iso) ? count : count + 1;
  }, 0);

  const step = (iso: string, delta: number) => {
    const next = addDays(iso, delta);
    if (today && next < today) return;
    const d = toDate(next);
    if (d.getUTCFullYear() !== cursor.year || d.getUTCMonth() !== cursor.month) {
      setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
      window.setTimeout(() => {
        document.getElementById(`rs-day-${next}`)?.focus();
      }, 0);
    } else {
      document.getElementById(`rs-day-${next}`)?.focus();
    }
  };

  const chip = (list: string[], value: string, kind: "in" | "out") =>
    list.map((time) => {
      const early = kind === "in" && time < STD_CHECK_IN;
      const late = kind === "out" && time > STD_CHECK_OUT;
      const sub = early ? "early" : late ? (time > "13:00" ? "late ++" : "late") : time === (kind === "in" ? STD_CHECK_IN : STD_CHECK_OUT) ? "std" : "";
      return (
        <button
          key={`${kind}-${time}`}
          type="button"
          className={`rs-chip${early || late ? " rs-chip-fee" : ""}`}
          aria-pressed={value === time}
          onClick={() => onChange(kind === "in" ? { timeIn: time } : { timeOut: time })}
        >
          {prettyTime(time)}
          {sub && <small>{sub}</small>}
        </button>
      );
    });

  return (
    <div className="rs-cal">
      <div className="rs-head">
        <button type="button" className="rs-nav" onClick={() => shiftMonth(-1)} disabled={!canGoBack} aria-label="Previous month">
          ‹
        </button>
        <div className="rs-month">
          <div className="rs-month-name">{`${MONTHS[cursor.month]} ${cursor.year}`}</div>
          <span className="rs-month-sub">{today ? `${freeThisMonth} free nights` : "Loading the calendar…"}</span>
        </div>
        <button type="button" className="rs-nav" onClick={() => shiftMonth(1)} disabled={!canGoForward} aria-label="Next month">
          ›
        </button>
        <div className="rs-legend" aria-hidden="true">
          <span><i className="rs-sw-free" />Free</span>
          <span><i className="rs-sw-sel" />Selected</span>
          <span><i className="rs-sw-held" />Booked</span>
          <span><i className="rs-sw-past" />Past</span>
        </div>
      </div>

      <div className="rs-dow" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="rs-days" role="group" aria-label="Choose the stay dates">
        {cells.map((iso, index) => {
          if (!iso) return <div key={`blank-${index}`} className="rs-day rs-blank" aria-hidden="true" />;

          const past = Boolean(today) && iso < today;
          const held = !past && isHeld(iso);
          const isStart = iso === checkin;
          const isEnd = Boolean(checkout) && iso === checkout;
          const inRange = Boolean(checkin && checkout && iso >= checkin && iso < checkout);
          const dayNumber = toDate(iso).getUTCDate();

          const classes = ["rs-day"];
          if (past) classes.push("rs-past");
          if (held) classes.push("rs-held");
          if (today && iso === today) classes.push("rs-today");
          if (inRange) classes.push("rs-sel");
          if (isStart) classes.push("rs-start");
          if (isEnd) classes.push("rs-end");

          const tag = past
            ? ""
            : held
              ? "Booked"
              : isStart
                ? "Check-in"
                : inRange
                  ? "Night"
                  : isEnd
                    ? "Check-out"
                    : "";
          const label = `${prettyDay(iso)}${past ? " (past)" : held ? " (booked)" : isStart ? " (check-in)" : isEnd ? " (check-out)" : inRange ? " (night)" : ""}`;
          const tabbable = isStart || (!checkin && iso === today) || (checkin && !checkout && iso === addDays(checkin, 1));

          return (
            <button
              key={iso}
              id={`rs-day-${iso}`}
              type="button"
              className={classes.join(" ")}
              aria-label={label}
              aria-pressed={inRange || undefined}
              disabled={past || held}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => pick(iso)}
              onKeyDown={(e) => {
                const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0;
                if (!delta) return;
                e.preventDefault();
                step(iso, delta);
              }}
            >
              <span className="rs-num">{dayNumber}</span>
              {tag && <span className="rs-tag">{tag}</span>}
            </button>
          );
        })}
      </div>

      <div className="rs-foot">
        <span className="rs-hint">{hint}</span>
        {(msg || error) && <span className="rs-err" role="alert">{msg || error}</span>}
        {(checkin || checkout) && (
          <button type="button" className="rs-text" onClick={() => { setMsg(""); onChange({ checkin: "", checkout: "" }); }}>
            Clear dates
          </button>
        )}
        <button
          type="button"
          className="rs-text"
          onClick={() => {
            const base = checkin || today || SL_TODAY();
            const d = toDate(base);
            setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
          }}
        >
          Go to my dates
        </button>
      </div>

      <div className="rs-readout">
        <div className="rs-read">
          <span className="rs-k">Check-in</span>
          <b className="rs-v">{checkin ? prettyDay(checkin) : "Choose a date"}</b>
          <span className="rs-t">{checkin ? `arrive from ${prettyTime(timeIn)}` : `from ${prettyTime(STD_CHECK_IN)}`}</span>
        </div>
        <span className="rs-arrow" aria-hidden="true">→</span>
        <div className="rs-read rs-out">
          <span className="rs-k">Check-out</span>
          <b className="rs-v">{checkout ? prettyDay(checkout) : "Choose a date"}</b>
          <span className="rs-t">{checkout ? `depart by ${prettyTime(timeOut)}` : `by ${prettyTime(STD_CHECK_OUT)}`}</span>
        </div>
        {nights > 0 ? (
          <span className="rs-nights">{`${nights} ${nights === 1 ? "night" : "nights"}`}</span>
        ) : (
          <span className="rs-nights rs-nights-off">no dates yet</span>
        )}
      </div>

      <div className="rs-times">
        <div className="rs-timeblock">
          <div className="rs-th">
            <b>Arrive from</b>
            <span>{timeIn < STD_CHECK_IN ? "early · +25% of a night" : "standard"}</span>
          </div>
          <div className="rs-chips" role="group" aria-label="Check-in time">
            {chip(CHECK_IN_TIMES, timeIn, "in")}
          </div>
        </div>
        <div className="rs-timeblock">
          <div className="rs-th">
            <b>Depart by</b>
            <span>{timeOut > "13:00" ? "late · +50% of a night" : timeOut > STD_CHECK_OUT ? "late · +25% of a night" : "standard"}</span>
          </div>
          <div className="rs-chips" role="group" aria-label="Check-out time">
            {chip(CHECK_OUT_TIMES, timeOut, "out")}
          </div>
        </div>
      </div>
    </div>
  );
}
