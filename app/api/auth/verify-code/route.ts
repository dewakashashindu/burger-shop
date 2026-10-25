import { connection, NextResponse } from "next/server";
import { findCustomer } from "@/lib/customer";
import { verifyOtp } from "@/lib/otp-store";
import { setSession } from "@/lib/session-token";
import { isSriLankanMobile, lastNine } from "@/lib/phone";

/**
 * POST /api/auth/verify-code
 * { phone, code } -> the guest is signed in (one httpOnly cookie) and their
 * own row from Tbl_CustomerMaster comes back for the welcome step.
 */
export async function POST(request: Request) {
  await connection();

  let body: { phone?: unknown; code?: unknown } | null = null;
  try {
    body = (await request.json()) as { phone?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ ok: false, message: "The code could not be read." }, { status: 400 });
  }

  const phone = String(body?.phone ?? "");
  const code = String(body?.code ?? "");
  if (!isSriLankanMobile(phone)) {
    return NextResponse.json({ ok: false, reason: "invalid-phone", message: "That number is not valid." }, { status: 400 });
  }

  const checked = await verifyOtp(phone, code, "signin");
  if (!checked.ok) {
    const status = checked.reason === "database" ? 503 : checked.reason === "none" ? 409 : 400;
    return NextResponse.json({ ok: false, reason: checked.reason, message: checked.message }, { status });
  }

  const customer = await findCustomer(phone);
  if (!customer) {
    return NextResponse.json(
      {
        ok: false,
        reason: "no-account",
        message: "That number isn’t in our book yet. Create an account to continue.",
      },
      { status: 409 },
    );
  }

  const response = NextResponse.json(
    { ok: true, customer },
    { headers: { "cache-control": "no-store" } },
  );
  setSession(response, lastNine(phone), customer.name);
  return response;
}
