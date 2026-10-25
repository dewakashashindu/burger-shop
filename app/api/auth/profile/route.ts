import { connection, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { findCustomer, updateCustomer } from "@/lib/customer";
import { sessionPhone } from "@/lib/session-token";
import { localPhone } from "@/lib/phone";

/**
 * PATCH /api/auth/profile
 * { name, email, adds } -> back into the guest's own row in Tbl_CustomerMaster.
 *
 * Only the details a guest may change: name, email and the four address lines.
 * The phone number is the key of the account and is never touched here — the
 * body may not carry one, and the update is pinned to the cookie's number.
 */
export async function PATCH(request: NextRequest) {
  await connection();

  const nine = sessionPhone(request);
  if (!nine) {
    return NextResponse.json({ ok: false, reason: "signed-out", message: "Please sign in again." }, { status: 401 });
  }

  type ProfileBody = { name?: unknown; email?: unknown; adds?: unknown };
  let body: ProfileBody | null = null;
  try {
    body = (await request.json()) as ProfileBody;
  } catch {
    return NextResponse.json({ ok: false, message: "The form could not be read." }, { status: 400 });
  }

  const customer = await findCustomer(localPhone(nine));
  if (!customer) {
    return NextResponse.json({ ok: false, reason: "signed-out", message: "Please sign in again." }, { status: 401 });
  }

  const saved = await updateCustomer(localPhone(nine), {
    name: body?.name === undefined ? undefined : String(body.name),
    email: body?.email === undefined ? undefined : String(body.email),
    adds: Array.isArray(body?.adds) ? (body!.adds as unknown[]).map((line) => String(line ?? "")) : undefined,
  });

  if (!saved.ok) {
    return NextResponse.json({ ok: false, reason: saved.error.kind, message: saved.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, customer: saved.customer }, { headers: { "cache-control": "no-store" } });
}
