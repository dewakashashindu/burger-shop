import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { lastNine } from "./phone";

/**
 * The signed-in guest, kept in one httpOnly cookie.
 *
 * The cookie holds nothing secret — a phone number, a name and an expiry — and
 * a signature over them with AUTH_SECRET. The browser can neither read nor
 * change it, and the server re-reads the guest's own row from
 * Tbl_CustomerMaster on every ask, so a stale name in the cookie never wins.
 */

export const SESSION_COOKIE = "mila_session";
const SESSION_DAYS = 30;

function secret(): string {
  const explicit = process.env.AUTH_SECRET?.trim();
  if (explicit) return explicit;

  // A stable fallback so a preview machine keeps its sessions after a restart.
  // Production should set AUTH_SECRET; this is derived from values only the
  // server has and is never printed.
  const derived = [process.env.DB_SERVER, process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASSWORD]
    .filter(Boolean)
    .join("|");
  if (derived) return `mila:${derived}`;

  if (!warned) {
    warned = true;
    console.warn("[auth] AUTH_SECRET is not set — using the built-in development secret.");
  }
  return "mila:dev-secret";
}
let warned = false;

const b64u = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const unb64u = (value: string) => Buffer.from(value, "base64url").toString("utf8");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export type SessionPayload = { nine: string; name: string; exp: number };

export function makeSessionToken(nine: string, name: string): string {
  const payload: SessionPayload = {
    nine,
    name,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60,
  };
  const body = b64u(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function readSessionToken(raw: unknown): SessionPayload | null {
  if (typeof raw !== "string" || !raw.includes(".")) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(unb64u(body)) as SessionPayload;
    if (!payload?.nine || !/^\d{9}$/.test(payload.nine)) return null;
    if (Number(payload.exp) * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSession(response: NextResponse, nine: string, name: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: makeSessionToken(nine, name),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.AUTH_COOKIE_SECURE === "1",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSession(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.AUTH_COOKIE_SECURE === "1",
    maxAge: 0,
  });
}

/** The nine digits of the signed-in guest, or `""`. */
export function sessionPhone(request: NextRequest): string {
  const payload = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  return payload ? payload.nine : "";
}

export { lastNine };
