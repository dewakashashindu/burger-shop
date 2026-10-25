import { connection, NextResponse } from "next/server";
import { clearSession } from "@/lib/session-token";

/** POST /api/auth/logout — forgets the cookie. The account stays in the book. */
export async function POST() {
  await connection();
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  clearSession(response);
  return response;
}
