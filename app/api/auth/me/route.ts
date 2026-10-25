import { connection, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { findCustomer } from "@/lib/customer";
import { sessionPhone } from "@/lib/session-token";
import { localPhone } from "@/lib/phone";

/**
 * GET /api/auth/me — who is signed in on this browser.
 *
 * The cookie says which number; the name, email and address always come from
 * Tbl_CustomerMaster, so the page never shows anything the book doesn't hold.
 */
export async function GET(request: NextRequest) {
  await connection();

  const nine = sessionPhone(request);
  if (!nine) {
    return NextResponse.json({ ok: true, signedIn: false }, { headers: { "cache-control": "no-store" } });
  }

  const customer = await findCustomer(localPhone(nine));
  if (!customer) {
    return NextResponse.json({ ok: true, signedIn: false }, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    { ok: true, signedIn: true, customer },
    { headers: { "cache-control": "no-store" } },
  );
}
