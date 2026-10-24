"use client";

import { useSyncExternalStore } from "react";

/**
 * Who is using the site right now — a browser-tab memory only.
 *
 * Sign-in is not connected to a real account service yet (no credential is ever
 * checked), so this is deliberately NOT a session token: it just remembers, for
 * this tab, that the guest passed the sign-in step. It is written when the
 * in-page sign-in card on checkout / confirm is submitted, and read by the
 * booking flow to decide whether that card has to be shown at all.
 */
export type Guest = { name: string; phone: string };

const KEY = "microechef-guest";

let guest: Guest | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Guest | null {
  if (loaded) return guest;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Guest>;
      if (typeof parsed?.phone === "string" && parsed.phone) {
        guest = { name: String(parsed.name ?? ""), phone: parsed.phone };
      }
    }
  } catch {
    /* private mode / storage disabled — the guest simply signs in again */
  }
  return guest;
}

export const getGuest = () => guest;
export const getServerGuest = () => null;
export function subscribeGuest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function rememberGuest(next: Guest) {
  guest = { name: next.name.trim(), phone: next.phone.trim() };
  loaded = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(guest));
  } catch {
    /* nothing to do — the tab keeps it in memory */
  }
  listeners.forEach((listener) => listener());
}
export function forgetGuest() {
  guest = null;
  loaded = true;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}

/** `null` until the tab has been read, so the first paint never flickers. */
export function useGuest(): Guest | null {
  return useSyncExternalStore(subscribeGuest, () => read(), getServerGuest);
}
