"use client";

import { useSyncExternalStore } from "react";
import { lastNine, localPhone } from "../lib/phone";

/**
 * Who is signed in on this browser.
 *
 * The truth lives in an httpOnly cookie that only the server can read; this
 * store is a mirror of it, so the first paint can already say "Nila" instead
 * of flickering. `refreshGuest()` asks /api/auth/me and replaces the mirror —
 * a name edited on another device, or a cookie that has expired, both land
 * here. Nothing secret is stored: a name, a phone number and (when it exists)
 * an email.
 */
export type Guest = {
  name: string;
  phone: string;
  email?: string;
  adds?: string[];
};

const KEY = "microechef-guest";

let guest: Guest | null = null;
let loaded = false;
let refreshing: Promise<Guest | null> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function read(): Guest | null {
  if (loaded) return guest;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Guest>;
      if (typeof parsed?.phone === "string" && parsed.phone) {
        guest = {
          name: String(parsed.name ?? ""),
          phone: parsed.phone,
          ...(typeof parsed.email === "string" ? { email: parsed.email } : {}),
          ...(Array.isArray(parsed.adds) ? { adds: parsed.adds.map(String) } : {}),
        };
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
  guest = {
    name: next.name.trim(),
    phone: next.phone.trim(),
    ...(next.email ? { email: next.email } : {}),
    ...(next.adds ? { adds: next.adds } : {}),
  };
  loaded = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(guest));
  } catch {
    /* nothing to do — the tab keeps it in memory */
  }
  emit();
}

export function forgetGuest() {
  guest = null;
  loaded = true;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Reads the cookie back through the server. */
export async function refreshGuest(): Promise<Guest | null> {
  if (typeof window === "undefined") return null;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; signedIn?: boolean; customer?: { name?: string; phone?: string; email?: string; adds?: string[] } }
        | null;
      if (data?.ok && data.signedIn && data.customer?.phone) {
        rememberGuest({
          name: data.customer.name ?? "",
          phone: data.customer.phone,
          email: data.customer.email,
          adds: data.customer.adds,
        });
        return guest;
      }
      if (guest) forgetGuest();
      return null;
    } catch {
      return guest;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Ends the session on the server and forgets the mirror. */
export async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* the cookie may outlive a failed call; the next refresh will settle it */
  }
  forgetGuest();
}

/** `null` until the tab has been read, so the first paint never flickers. */
export function useGuest(): Guest | null {
  return useSyncExternalStore(subscribeGuest, () => read(), getServerGuest);
}

export { lastNine, localPhone };
