import { NextResponse } from "next/server";

import {
  replyEmail,
  stayGuestEmail,
  stayManagerEmail,
  tableGuestEmail,
  tableManagerEmail,
} from "@/lib/booking-notify";
import { fromLine, mailConfigured, managerEmail, sendMail } from "@/lib/mail";
import { smsConfigured } from "@/lib/sms";

/**
 * GET /api/mail/test?to=you@gmail.com
 *
 * Sends the four booking emails — table + stay, guest + desk — to `to`, using
 * the same templates and the same SMTP settings a real booking would. It writes
 * nothing anywhere: no row, no transaction number, no booking.
 *
 * It exists because "did my SMTP details work?" should not need a fake
 * reservation on the real calendar. The answer lists what happened to each
 * message, and the settings that are actually in force.
 *
 * Nothing is sent unless SMTP is configured; the answer then says `logged`,
 * which means the server wrote the message to its log instead.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = (url.searchParams.get("to") ?? "").trim();
  const only = (url.searchParams.get("which") ?? "all").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Add ?to=an@address.com — the emails are sent to that inbox.",
        configured: settings(),
      },
      { status: 400 },
    );
  }

  const table = {
    resId: "T000000",
    tableNo: "T2",
    area: "Terrace",
    date: "2026-11-12",
    from: "19:00",
    to: "21:00",
    pax: 2,
    name: "Test Guest",
    phone: "0772336233",
    email: to,
    note: "Example booking — a test, not a real reservation.",
  };

  const stay = {
    resId: "T000000",
    rooms: [{ name: "Garden Room" }],
    checkin: "2026-11-12",
    checkout: "2026-11-15",
    nights: 3,
    adults: 2,
    children: 0,
    arrival: "14:00",
    departure: "11:00",
    board: "breakfast",
    currency: "LKR",
    total: 73500,
    name: "Test Guest",
    phone: "0772336233",
    email: to,
    idNo: "000000000V",
    country: "Sri Lanka",
    requests: "Example booking — a test, not a real reservation.",
  };

  const wanted = (key: string) => only === "all" || only === key;
  const jobs: { key: string; run: () => Promise<string> }[] = [];

  if (wanted("guest")) {
    jobs.push({ key: "table-guest", run: () => send(tableGuestEmail(table), to) });
    jobs.push({ key: "stay-guest", run: () => send(stayGuestEmail(stay), to) });
  }
  if (wanted("desk") || wanted("manager")) {
    jobs.push({ key: "table-desk", run: () => send(tableManagerEmail(table), managerEmail()) });
    jobs.push({ key: "stay-desk", run: () => send(stayManagerEmail(stay), managerEmail()) });
  }

  const sent: Record<string, string> = {};
  for (const job of jobs) sent[job.key] = await job.run();

  return NextResponse.json(
    {
      ok: !Object.values(sent).includes("failed"),
      sent,
      configured: settings(),
      note: mailConfigured()
        ? "Live SMTP: check the inbox (and the spam folder once)."
        : "SMTP is not configured, so nothing left the server — the messages were written to the log. Fill SMTP_HOST / SMTP_USER / SMTP_PASS in .env and restart.",
    },
    { headers: { "cache-control": "no-store" } },
  );

  async function send(mail: { subject: string; html: string; text: string }, target: string) {
    const result = await sendMail({
      to: target,
      subject: `[TEST] ${mail.subject}`,
      html: mail.html,
      text: `This is a test message — no booking was made.\n\n${mail.text}`,
      replyTo: replyEmail(),
    });
    if (!result.ok) return "failed";
    return result.via === "smtp" ? "sent" : "logged";
  }
}

function settings() {
  const mask = (value: string) => (value ? `${value.slice(0, 2)}${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-2)}` : "");
  return {
    smtp: mailConfigured(),
    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: process.env.SMTP_PORT ?? "",
    smtpSecure: process.env.SMTP_SECURE ?? "",
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: mask(process.env.SMTP_PASS ?? ""),
    from: fromLine(),
    desk: managerEmail(),
    replyTo: replyEmail(),
    sms: smsConfigured() ? "Text.lk token set" : "Text.lk token not set — texts are written to the log",
  };
}
