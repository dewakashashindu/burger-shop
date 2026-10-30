/**
 * Text.lk — the SMS that carries the six-digit code.
 *
 * TEXTLK_API_TOKEN and TEXTLK_SENDER_ID come from .env. The token is read on
 * the server only; nothing about it ever reaches the browser.
 *
 * When the token is missing the code is written to the server log instead, so
 * a preview machine can still walk through the flow. That fallback never sends
 * a message and never pretends one was sent.
 */

const DEFAULT_ENDPOINT = "https://app.text.lk/api/v3/sms/send";

export const smsConfigured = () => Boolean(process.env.TEXTLK_API_TOKEN?.trim());

export function otpMessage(code: string) {
  return `Mila Mirissa: your sign-in code is ${code}. It is valid for 5 minutes. Do not share it with anyone.`;
}

export type SmsResult =
  | { ok: true; via: "textlk" }
  | { ok: true; via: "log" }
  | { ok: false; message: string };

/**
 * Sends one text through Text.lk. `to` is the number with the country code and
 * no plus (`94772336233`), which is what the API expects.
 *
 * Shared by the sign-in code and by booking confirmations — same token, same
 * sender, same failure rules: a missing token writes to the log and says so.
 */
export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const token = process.env.TEXTLK_API_TOKEN?.trim();
  const sender = process.env.TEXTLK_SENDER_ID?.trim();
  const recipient = to.replace(/\D/g, "");

  if (!token || !sender) {
    console.info(`[sms] TEXTLK_API_TOKEN / TEXTLK_SENDER_ID not set — message for ${recipient}: ${message}`);
    return { ok: true, via: "log" };
  }
  if (!recipient) return { ok: false, message: "That phone number cannot receive a text." };

  const endpoint = process.env.TEXTLK_API_URL?.trim() || DEFAULT_ENDPOINT;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient, sender_id: sender, type: "plain", message }),
      signal: AbortSignal.timeout(12_000),
    });

    const body = (await response.json().catch(() => null)) as
      | { status?: string; message?: string; data?: unknown }
      | null;

    if (!response.ok || (body?.status && body.status !== "success")) {
      console.error(`[sms] text.lk refused (${response.status}):`, body?.message ?? body ?? "");
      return { ok: false, message: "We couldn’t send the code by SMS. Please try again in a moment." };
    }
    return { ok: true, via: "textlk" };
  } catch (error) {
    console.error("[sms] text.lk unreachable:", (error as Error)?.message);
    return { ok: false, message: "We couldn’t reach the SMS service. Please try again in a moment." };
  }
}

/** The six-digit sign-in code — the same sender, with the code's own wording. */
export async function sendOtpSms(toNine: string, code: string): Promise<SmsResult> {
  return sendSms(`94${toNine}`, otpMessage(code));
}
