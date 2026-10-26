"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut, useGuest } from "./session";

/**
 * Signing out by itself.
 *
 * A session that is never used should not stay open forever. This component
 * watches for real activity — a tap, a key, a scroll, a wheel, a tab coming
 * back into view — and writes the moment of the last one to localStorage, so
 * every tab of this browser shares one clock: reading a page in a second tab
 * keeps the first one signed in too.
 *
 * When the clock runs past the quiet limit the session is ended properly
 * (POST /api/auth/logout clears the httpOnly cookie, then the mirror is
 * dropped), and a small card explains what happened and offers the way back.
 * One minute before that, a quiet bar offers "Stay signed in", so nobody is
 * thrown out mid-sentence without warning.
 *
 * The limit is IDLE_SIGNOUT_MINUTES (NEXT_PUBLIC_IDLE_SIGNOUT_MINUTES at build
 * time), 30 minutes by default. Nothing is sent anywhere: this is a local
 * clock, and the server keeps its own 30-day expiry on the cookie.
 */

const ACTIVITY_KEY = "microechef-last-activity";

const minutes = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_IDLE_SIGNOUT_MINUTES ?? "30");
  if (!Number.isFinite(raw) || raw <= 0) return 30;
  return Math.min(Math.max(raw, 1), 12 * 60);
})();

const IDLE_MS = minutes * 60_000;
/** The warning lands one minute out, but never later than half the limit. */
const WARN_MS = Math.min(60_000, Math.round(IDLE_MS / 2));
const TICK_MS = 5_000;

function touch() {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* storage blocked — the in-memory clock below still works */
  }
}

function lastSeen(): number {
  try {
    const raw = Number(window.localStorage.getItem(ACTIVITY_KEY));
    if (Number.isFinite(raw) && raw > 0) return raw;
  } catch {
    /* ignore */
  }
  return Date.now();
}

export default function IdleSignOut() {
  const guest = useGuest();
  const router = useRouter();
  const pathname = usePathname();

  // Two states, both driven by the same ticking clock.
  const [warnLeft, setWarnLeft] = useState(0); // seconds left, while warning
  const [ended, setEnded] = useState(false); // "we signed you out" card
  const signedOutFor = useRef<string>("");

  useEffect(() => {
    if (!guest) {
      setWarnLeft(0);
      return;
    }
    // A fresh sign-in starts the clock at zero, not at whatever an older visit
    // left behind.
    if (signedOutFor.current !== guest.phone) {
      signedOutFor.current = guest.phone;
      touch();
    }

    const wake = () => touch();
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
    ];
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }));

    // Coming back to a tab is activity — and the first chance to notice that
    // the limit was passed while the tab slept.
    const onVisible = () => {
      if (document.visibilityState === "visible") touch();
      check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", wake);

    let ending = false;

    function check() {
      const idleFor = Date.now() - lastSeen();
      if (idleFor >= IDLE_MS) {
        if (ending) return;
        ending = true;
        setWarnLeft(0);
        // The server cookie goes first; the mirror follows in signOut().
        void signOut().finally(() => {
          setEnded(true);
          ending = false;
          // Pages that render "signed in as …" redraw as guests.
          router.refresh();
        });
        return;
      }
      const left = IDLE_MS - idleFor;
      setWarnLeft(left <= WARN_MS ? Math.ceil(left / 1000) : 0);
    }

    check();
    const id = window.setInterval(check, TICK_MS);
    return () => {
      window.clearInterval(id);
      events.forEach((name) => window.removeEventListener(name, wake));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", wake);
    };
  }, [guest, router]);

  const stay = () => {
    touch();
    setWarnLeft(0);
  };

  // Signed out by the clock: say so plainly, and offer the way back to where
  // the guest was standing.
  if (ended) {
    return (
      <div className="idle-card" role="status" aria-live="polite">
        <p className="idle-card__title">You’ve been signed out.</p>
        <p className="idle-card__body">
          {minutes} minutes of quiet ended the session. Your booking details are still on this
          page — sign in again to finish.
        </p>
        <div className="idle-card__row">
          <Link className="idle-card__link" href={`/auth/login?next=${encodeURIComponent(pathname || "/")}`}>
            Sign in again
          </Link>
          <button type="button" className="idle-card__close" onClick={() => setEnded(false)}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (!warnLeft) return null;

  return (
    <div className="idle-warn" role="status" aria-live="polite">
      <span>
        Still there? You’ll be signed out in{" "}
        <b>
          {warnLeft >= 60 ? "1 minute" : `${warnLeft} second${warnLeft === 1 ? "" : "s"}`}
        </b>
        .
      </span>
      <button type="button" onClick={stay}>
        Stay signed in
      </button>
    </div>
  );
}
