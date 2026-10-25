import { connection, NextResponse } from "next/server";
import { findCustomer } from "@/lib/customer";
import { clearOtps, purposeOf, startOtp } from "@/lib/otp-store";
import { sendOtpSms } from "@/lib/sms";
import { isSriLankanMobile, lastNine } from "@/lib/phone";

/**
 * POST /api/auth/send-code
 * { phone, purpose? }
 *
 *   purpose "signin" (default) — only a number already in dbo.Tbl_CustomerMaster
 *                                gets a code. A stranger receives nothing.
 *   purpose "signup"           — the other way round: a number that already has
 *                                an account is told to sign in instead.
 *
 * Either way the book is read **before** any code is made or any text is paid
 * for, and the answer says which door to open. Nothing about the customer is
 * returned until the code has been verified.
 */
export async function POST(request: Request) {
  await connection();

  let body: { phone?: unknown; purpose?: unknown } | null = null;
  try {
    body = (await request.json()) as { phone?: unknown; purpose?: unknown };
  } catch {
    return NextResponse.json({ ok: false, message: "The number could not be read." }, { status: 400 });
  }

  const phone = String(body?.phone ?? "");
  const purpose = purposeOf(body?.purpose);

  if (!isSriLankanMobile(phone)) {
    return NextResponse.json(
      { ok: false, reason: "invalid-phone", message: "Enter a Sri Lankan mobile number, e.g. 77 233 6233." },
      { status: 400 },
    );
  }

  let customer = null;
  try {
    customer = await findCustomer(phone);
  } catch (error) {
    console.error("[auth] the customer book could not be read:", (error as Error)?.message);
    return NextResponse.json(
      { ok: false, reason: "database", message: "We couldn’t check that number just now. Please try again." },
      { status: 503 },
    );
  }

  if (purpose === "signin" && !customer) {
    console.info(`[auth] no account for ••••${lastNine(phone).slice(-4)} — no code sent`);
    return NextResponse.json(
      {
        ok: false,
        reason: "no-account",
        message: "This number isn’t in our book yet. Create an account to continue.",
      },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  if (purpose === "signup" && customer) {
    return NextResponse.json(
      {
        ok: false,
        reason: "has-account",
        message: "This number already has an account. Sign in with a code instead.",
      },
      { status: 409, headers: { "cache-control": "no-store" } },
    );
  }

  const started = await startOtp(phone, purpose);
  if (!started.ok) {
    if (started.reason === "cooldown") {
      return NextResponse.json(
        { ok: false, reason: "cooldown", retryIn: started.retryIn, message: "A code was just sent. Please wait a moment." },
        { status: 429, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json({ ok: false, reason: "database", message: started.message }, { status: 503 });
  }

  const sent = await sendOtpSms(lastNine(phone), started.code);
  if (!sent.ok) {
    // The text never left: delete the code so the guest is not held by the
    // 60-second cooldown on a message they never received.
    await clearOtps(phone);
    return NextResponse.json({ ok: false, reason: "sms", message: sent.message }, { status: 502 });
  }

  console.info(`[auth] ${purpose} code sent (${sent.via}) to ••••${lastNine(phone).slice(-4)}`);
  return NextResponse.json(
    {
      ok: true,
      purpose,
      expiresIn: started.expiresIn,
      // Only ever on a machine with WEB_AUTH_DEV=1 and no SMS token: it lets
      // the local walkthrough and the test suites read the code.
      ...(process.env.WEB_AUTH_DEV === "1" ? { devCode: started.code, devSms: sent.via } : {}),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
