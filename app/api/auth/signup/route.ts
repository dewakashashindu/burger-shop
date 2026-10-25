import { connection, NextResponse } from "next/server";
import { createCustomer, findCustomer } from "@/lib/customer";
import { clearOtps, verifyOtp } from "@/lib/otp-store";
import { setSession } from "@/lib/session-token";
import { isSriLankanMobile, lastNine } from "@/lib/phone";

/**
 * POST /api/auth/signup
 * { name, phone, adds[4], email, code } -> one row in dbo.Tbl_CustomerMaster.
 *
 * Nothing is written until the number has been proved: the guest asks for a
 * code (`POST /api/auth/send-code` with purpose "signup"), types it back, and
 * only a correct code reaches the book. That code is deleted as it is spent.
 *
 * With the number proved, the guest is signed in on the spot — one text is
 * enough for one visit. LoCCode carries the web location code; CusCode comes
 * from dbo.Tbl_TxnNumbers.
 */
export async function POST(request: Request) {
  await connection();

  type SignupBody = { name?: unknown; phone?: unknown; adds?: unknown; email?: unknown; code?: unknown };
  let body: SignupBody | null = null;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ ok: false, message: "The form could not be read." }, { status: 400 });
  }

  const phone = String(body?.phone ?? "");
  const code = String(body?.code ?? "").replace(/\D/g, "");

  if (!isSriLankanMobile(phone)) {
    return NextResponse.json(
      { ok: false, reason: "invalid-phone", message: "Enter a Sri Lankan mobile number, e.g. 77 233 6233." },
      { status: 400 },
    );
  }

  // Shape checks first, so a typo never costs the guest their code.
  const name = String(body?.name ?? "").trim();
  const adds = Array.isArray(body?.adds) ? body!.adds!.map((line) => String(line ?? "")) : [];
  const email = String(body?.email ?? "").trim();

  if (name.length < 2) {
    return NextResponse.json({ ok: false, reason: "invalid", message: "Please enter your name." }, { status: 400 });
  }
  if (!adds[0]?.trim()) {
    return NextResponse.json(
      { ok: false, reason: "invalid", message: "Please enter at least the first line of your address." },
      { status: 400 },
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, reason: "invalid", message: "That email address doesn’t look right." }, { status: 400 });
  }
  if (code.length !== 6) {
    return NextResponse.json(
      { ok: false, reason: "bad-code", message: "Enter the six-digit code we texted you." },
      { status: 400 },
    );
  }

  const existing = await findCustomer(phone);
  if (existing) {
    return NextResponse.json(
      { ok: false, reason: "exists", message: "This number already has an account. Sign in instead." },
      { status: 409 },
    );
  }

  // The number has to be proved before anything is written.
  const checked = await verifyOtp(phone, code, "signup");
  if (!checked.ok) {
    const status = checked.reason === "database" ? 503 : checked.reason === "none" ? 409 : 400;
    return NextResponse.json({ ok: false, reason: "bad-code", message: checked.message }, { status });
  }

  const made = await createCustomer({ name, phone, adds, email });
  if (!made.ok) {
    const { kind, message } = made.error;
    const status = kind === "invalid" ? 400 : kind === "exists" ? 409 : kind === "code-clash" ? 409 : 503;
    console.error(`[auth] signup failed (${kind}): ${message}`);
    return NextResponse.json({ ok: false, reason: kind, message }, { status });
  }

  // Nothing is left of the codes for this number: the business is finished.
  await clearOtps(phone);

  const response = NextResponse.json(
    {
      ok: true,
      customer: {
        locCode: made.customer.locCode,
        cusCode: made.customer.cusCode,
        name: made.customer.name,
        phone: made.customer.phone,
        email: made.customer.email,
        adds: made.customer.adds,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );

  // The number was proved a moment ago, so the account starts signed in.
  setSession(response, lastNine(phone), made.customer.name);
  console.info(`[auth] account created · ${made.customer.name} · ${made.customer.cusCode || "—"} · ••••${made.customer.phone.slice(-4)}`);
  return response;
}
