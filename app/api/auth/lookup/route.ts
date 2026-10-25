import { connection, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { findCustomer } from "@/lib/customer";
import { sessionPhone } from "@/lib/session-token";
import { isSriLankanMobile, lastNine } from "@/lib/phone";

/**
 * GET /api/auth/lookup?phone=0771234567
 *
 * What the booking form may fill in by itself once a number is typed.
 *
 * Only a number this browser has already proved — the one in the session
 * cookie — returns a name and an address. Any other number returns nothing but
 * `hasAccount`, so the form can offer "sign in and we'll bring your details"
 * without ever handing one guest's address to another at a keyboard. ("Does
 * this number have an account" is already public: sign-in says so before it
 * texts anything.)
 */
export async function GET(request: NextRequest) {
  await connection();

  const phone = request.nextUrl.searchParams.get("phone") ?? "";
  if (!isSriLankanMobile(phone)) {
    return NextResponse.json({ ok: false, reason: "invalid-phone" }, { status: 400 });
  }

  const nine = lastNine(phone);
  const signedIn = sessionPhone(request);

  if (signedIn && signedIn === nine) {
    const customer = await findCustomer(phone);
    if (customer) {
      return NextResponse.json(
        {
          ok: true,
          verified: true,
          hasAccount: true,
          customer: { name: customer.name, email: customer.email, adds: customer.adds },
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
  }

  let hasAccount = false;
  try {
    hasAccount = Boolean(await findCustomer(phone));
  } catch {
    return NextResponse.json({ ok: false, reason: "database" }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true, verified: false, hasAccount },
    { headers: { "cache-control": "no-store" } },
  );
}
