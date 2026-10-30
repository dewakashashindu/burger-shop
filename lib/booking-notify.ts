/**
 * What happens the moment a booking is written: a text to the guest, an email
 * to the guest, and the same booking emailed to the restaurant (MGRemail).
 *
 * Nothing here can fail a booking. Every send is best-effort, runs after the
 * transaction has committed, and reports itself in the API answer as
 *   { sms: "sent" | "logged" | "skipped" | "failed", guest: …, manager: … }
 * so the desk can see what actually left the building.
 *
 * The wording is fixed and plain: booking number, date, time, guests, room or
 * table, what it costs, and how to change it. Every text carries the STOP line
 * the guest is entitled to — with the phone number and an email address in it.
 */

import { internationalDigits, localPhone, prettyPhone } from "./phone";
import { sendSms } from "./sms";
import {
  FALLBACK_DESK_EMAIL,
  LOGO_CID,
  logoAttachment,
  mailConfigured,
  managerEmail,
  sendMail,
} from "./mail";

export type ChannelResult = "sent" | "logged" | "skipped" | "failed";
export type NotifySummary = { sms: ChannelResult; guest: ChannelResult; manager: ChannelResult };

/** The number printed on every page, and in every message. */
export const CONTACT_PHONE = (process.env.CONTACT_PHONE?.trim() || "0772336233");

/**
 * The address a guest is told to write to. Deliberately NOT MGRemail: the
 * restaurant's own copy may point at a personal inbox (or, while testing, at
 * the very guest being written to), and "write to yourself" is not an answer.
 * Set REPLY_EMAIL to move it; otherwise the shop's Gmail.
 */
export const REPLY_EMAIL = (process.env.REPLY_EMAIL?.trim() || FALLBACK_DESK_EMAIL);

/** Read the same value at call time — handy for tools and test routes. */
export const replyEmail = () => process.env.REPLY_EMAIL?.trim() || FALLBACK_DESK_EMAIL;

/**
 * `0771234567` → `077 123 4567`. A number is read off a phone screen by eye, so
 * every phone in a text or an email is grouped the same way.
 */
const readablePhone = (value: unknown) => {
  const pretty = prettyPhone(value);
  if (!pretty) return localPhone(CONTACT_PHONE) || CONTACT_PHONE;
  return `0${pretty}`;
};

/** How the restaurant says its own number. */
const prettyContact = () => readablePhone(CONTACT_PHONE);

/** "Reply STOP to opt out · 077 233 6233 · hello@…" — in every text we send. */
export function stopLine() {
  return `Reply STOP to stop these texts · ${prettyContact()} · ${REPLY_EMAIL}`;
}

/* ── words ────────────────────────────────────────────────────────────── */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** `2026-11-12` → `Thursday 12 November 2026`. */
export function longDay(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(`${iso}T12:00:00Z`);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()];
  return `${weekday} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `19:00` → `7:00 PM`. */
export function clock(hhmm: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm ?? "");
  if (!match) return hhmm ?? "";
  const hour = Number(match[1]);
  const suffix = hour < 12 ? "AM" : "PM";
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${shown}:${match[2]} ${suffix}`;
}

const money = (amount: number, currency: string) =>
  currency === "USD" ? `USD ${amount.toLocaleString("en-US")}` : `LKR ${amount.toLocaleString("en-US")}`;

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ── the logo ──────────────────────────────────────────────────────────── */

/**
 * The emblem lives at the top of every email. `lib/mail.ts` owns the file (and
 * attaches it automatically whenever the HTML asks for a `cid:` image), so this
 * only has to know the name it is addressed by.
 */
function headerMark() {
  const emblem = logoAttachment();
  if (!emblem) {
    return `<div style="font:400 22px/1.1 Georgia,'Times New Roman',serif;letter-spacing:.02em;color:#241f18;">MILA MIRISSA</div>`;
  }
  return `<img src="cid:${LOGO_CID}" width="64" height="64" alt="Mila Mirissa"
              style="display:block;width:64px;height:64px;border:0;border-radius:50%;outline:none;text-decoration:none;">`;
}

/** Every booking email carries the emblem (attached by `sendMail`). */
const attachments = () => {
  const emblem = logoAttachment();
  return emblem ? [emblem] : undefined;
};

/* ── the email shell (cream, serif, the same face as the site) ─────────── */

type Row = [string, string];

function shell(options: {
  eyebrow: string;
  title: string;
  intro: string;
  rows: Row[];
  total?: string;
  closing: string;
  footerNote?: string;
}) {
  const rows = options.rows
    .filter(([, value]) => value && String(value).trim())
    .map(
      ([label, value]) => `
          <tr>
            <td style="padding:9px 0;border-bottom:1px solid #e7ded1;font:400 13px/1.4 Georgia,'Times New Roman',serif;color:#8a7b63;vertical-align:top;width:42%">${esc(label)}</td>
            <td style="padding:9px 0;border-bottom:1px solid #e7ded1;font:400 14px/1.5 Georgia,'Times New Roman',serif;color:#2f2a22;vertical-align:top">${esc(value)}</td>
          </tr>`,
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(options.title)}</title></head>
<body style="margin:0;padding:0;background:#f6f1e7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e7;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e7ded1;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:26px 30px 0 30px;">
          ${headerMark()}
          <div style="margin-top:16px;font:600 11px/1.2 Verdana,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8a7b63;">${esc(options.eyebrow)}</div>
          <h1 style="margin:12px 0 0;font:400 30px/1.2 Georgia,'Times New Roman',serif;color:#241f18;letter-spacing:-.01em;">${esc(options.title)}</h1>
          <p style="margin:12px 0 0;font:400 14px/1.6 Georgia,'Times New Roman',serif;color:#5c5548;">${esc(options.intro)}</p>
        </td></tr>
        <tr><td style="padding:18px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
        ${
          options.total
            ? `<tr><td style="padding:14px 30px 0 30px;">
          <table role="presentation" width="100%"><tr>
            <td style="font:600 11px/1.2 Verdana,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a7b63;">Total</td>
            <td align="right" style="font:400 24px/1.2 Georgia,'Times New Roman',serif;color:#241f18;">${esc(options.total)}</td>
          </tr></table>
        </td></tr>`
            : ""
        }
        <tr><td style="padding:20px 30px 0 30px;">
          <p style="margin:0;font:400 14px/1.6 Georgia,'Times New Roman',serif;color:#5c5548;">${esc(options.closing)}</p>
        </td></tr>
        <tr><td style="padding:20px 30px 26px 30px;">
          <div style="border-top:1px solid #e7ded1;padding-top:16px;font:400 12px/1.7 Verdana,Arial,sans-serif;color:#8a7b63;">
            <strong style="color:#2f2a22;">Mila Mirissa</strong> · Mirissa, Sri Lanka<br>
            Call or WhatsApp <a href="tel:${esc(CONTACT_PHONE)}" style="color:#2f2a22;">${esc(prettyContact())}</a>
            · <a href="mailto:${esc(REPLY_EMAIL)}" style="color:#2f2a22;">${esc(REPLY_EMAIL)}</a><br>
            <span style="display:inline-block;margin-top:10px;color:#9a8d78;">${esc(options.footerNote ?? "You are receiving this because you booked a table with us. Reply STOP by text to stop booking texts, or write to the address above to have your details removed.")}</span>
          </div>
        </td></tr>
      </table>
      <div style="max-width:560px;padding:14px 6px 0;font:400 11px/1.6 Verdana,Arial,sans-serif;color:#a2957f;text-align:center;">
        This is an automated confirmation of a booking that is already saved in the restaurant’s book.
      </div>
    </td></tr>
  </table>
</body></html>`;
}

/* ── table bookings ───────────────────────────────────────────────────── */

export type TableNotice = {
  resId: string;
  tableNo: string;
  area: string;
  date: string;
  from: string;
  to: string;
  pax: number;
  name: string;
  phone: string;
  email?: string;
  note?: string;
};

export function tableGuestEmail(booking: TableNotice) {
  const rows: Row[] = [
    ["Booking number", booking.resId],
    ["Date", longDay(booking.date)],
    ["Time", `${clock(booking.from)} – ${clock(booking.to)}`],
    ["Guests", String(booking.pax)],
    ["Table", [booking.tableNo, booking.area].filter(Boolean).join(" · ")],
    ["Name", booking.name],
    ["Phone", readablePhone(booking.phone)],
  ];
  if (booking.note) rows.push(["Your note", booking.note]);

  return {
    subject: `Your table at Mila Mirissa — ${longDay(booking.date)}, ${clock(booking.from)}`,
    attachments: attachments(),
    text: [
      `Your table at Mila Mirissa is booked.`,
      ``,
      ...rows.map(([label, value]) => `${label}: ${value}`),
      ``,
      `Nothing is charged on the website — you pay at the restaurant.`,
      `To change or cancel, call ${prettyContact()} or write to ${REPLY_EMAIL}.`,
      ``,
      `Mila Mirissa · Mirissa, Sri Lanka`,
    ].join("\n"),
    html: shell({
      eyebrow: "Table confirmed",
      title: "Your table is held.",
      intro: `${booking.name}, we have your table for ${booking.pax} on ${longDay(booking.date)}. The desk holds it for 15 minutes past the start time.`,
      rows,
      closing: "Nothing is charged on the website — you pay at the restaurant. If you need to change or cancel, call us or reply to this email; the earlier the better.",
    }),
  };
}

export function tableManagerEmail(booking: TableNotice) {
  const rows: Row[] = [
    ["Booking number", booking.resId],
    ["Date", longDay(booking.date)],
    ["Period", `${clock(booking.from)} – ${clock(booking.to)}`],
    ["Guests", String(booking.pax)],
    ["Table", [booking.tableNo, booking.area].filter(Boolean).join(" · ")],
    ["Guest", booking.name],
    ["Phone", readablePhone(booking.phone)],
    ["Email", booking.email ?? ""],
    ["Note", booking.note ?? ""],
    ["Source", "Website · /reserve"],
  ];
  return {
    subject: `New table booking — ${booking.resId} · ${longDay(booking.date)} ${clock(booking.from)}`,
    attachments: attachments(),
    text: [
      `A new table reservation came in from the website.`,
      ``,
      ...rows.map(([label, value]) => `${label}: ${value}`),
    ].join("\n"),
    html: shell({
      eyebrow: "New reservation",
      title: `${booking.pax} guests, ${clock(booking.from)}`,
      intro: `A table booking arrived from the website just now. The number is in the book already — this email is the desk’s copy.`,
      rows,
      closing: `Call the guest on ${readablePhone(booking.phone)} to confirm.`,
      footerNote: "The restaurant gets this email for every booking — no text message is sent to the desk.",
    }),
  };
}

/* ── room stays ───────────────────────────────────────────────────────── */

export type StayNotice = {
  resId: string;
  rooms: { name: string }[];
  checkin: string;
  checkout: string;
  nights: number;
  adults: number;
  children: number;
  arrival?: string;
  departure?: string;
  board: string;
  currency: string;
  total: number;
  name: string;
  phone: string;
  email?: string;
  idNo?: string;
  country?: string;
  requests?: string;
};

export function stayGuestEmail(stay: StayNotice) {
  const rows: Row[] = [
    ["Booking number", stay.resId],
    ["Rooms", stay.rooms.map((room) => room.name).join(" · ")],
    ["Check-in", `${longDay(stay.checkin)}${stay.arrival ? `, from ${clock(stay.arrival)}` : ""}`],
    ["Check-out", `${longDay(stay.checkout)}${stay.departure ? `, by ${clock(stay.departure)}` : ""}`],
    ["Nights", String(stay.nights)],
    ["Guests", `${stay.adults} adult${stay.adults === 1 ? "" : "s"}${stay.children ? ` · ${stay.children} child${stay.children === 1 ? "" : "ren"}` : ""}`],
    ["Board", stay.board],
    ["Name", stay.name],
    ["Phone", readablePhone(stay.phone)],
  ];
  if (stay.requests) rows.push(["Your requests", stay.requests]);

  return {
    subject: `Your stay at Mila Mirissa — ${longDay(stay.checkin)} to ${longDay(stay.checkout)}`,
    attachments: attachments(),
    text: [
      `Your stay at Mila Mirissa is booked.`,
      ``,
      ...rows.map(([label, value]) => `${label}: ${value}`),
      `Total: ${money(stay.total, stay.currency)} — paid at the property.`,
      ``,
      `Free cancellation until two days before check-in.`,
      `To change or cancel, call ${prettyContact()} or write to ${REPLY_EMAIL}.`,
      ``,
      `Mila Mirissa · Mirissa, Sri Lanka`,
    ].join("\n"),
    html: shell({
      eyebrow: "Stay confirmed",
      title: "The room is yours.",
      intro: `${stay.name}, your stay is saved for ${longDay(stay.checkin)} to ${longDay(stay.checkout)} — ${stay.nights} night${stay.nights === 1 ? "" : "s"} in ${stay.rooms.map((room) => room.name).join(" and ")}.`,
      rows,
      total: money(stay.total, stay.currency),
      closing: "Nothing is charged on the website — you settle at the property. Free cancellation until two days before check-in; after that the first night is kept.",
    }),
  };
}

export function stayManagerEmail(stay: StayNotice) {
  const rows: Row[] = [
    ["Booking number", stay.resId],
    ["Rooms", stay.rooms.map((room) => room.name).join(" · ")],
    ["Check-in", `${longDay(stay.checkin)}${stay.arrival ? ` · from ${clock(stay.arrival)}` : ""}`],
    ["Check-out", `${longDay(stay.checkout)}${stay.departure ? ` · by ${clock(stay.departure)}` : ""}`],
    ["Nights", String(stay.nights)],
    ["Guests", `${stay.adults} adult${stay.adults === 1 ? "" : "s"}${stay.children ? ` · ${stay.children} child${stay.children === 1 ? "" : "ren"}` : ""}`],
    ["Board", stay.board],
    ["Guest", stay.name],
    ["Phone", readablePhone(stay.phone)],
    ["Email", stay.email ?? ""],
    ["NIC / passport", stay.idNo ?? ""],
    ["Country", stay.country ?? ""],
    ["Requests", stay.requests ?? ""],
    ["Source", "Website · /reserve"],
  ];
  return {
    subject: `New room booking — ${stay.resId} · ${longDay(stay.checkin)}`,
    attachments: attachments(),
    text: [
      `A new room reservation came in from the website.`,
      ``,
      ...rows.map(([label, value]) => `${label}: ${value}`),
      `Total: ${money(stay.total, stay.currency)}`,
    ].join("\n"),
    html: shell({
      eyebrow: "New reservation",
      title: `${stay.nights} night${stay.nights === 1 ? "" : "s"} in ${stay.rooms[0]?.name ?? "the house"}`,
      intro: "A stay arrived from the website just now. It is in the stay book already — this email is the desk’s copy.",
      rows,
      total: money(stay.total, stay.currency),
      closing: `Call the guest on ${readablePhone(stay.phone)} to confirm arrival.`,
      footerNote: "The restaurant gets this email for every booking — no text message is sent to the desk.",
    }),
  };
}

/* ── the text messages ────────────────────────────────────────────────── */

export function tableSms(booking: TableNotice) {
  return (
    `Mila Mirissa: table ${booking.resId} is booked — ${longDay(booking.date)}, ` +
    `${clock(booking.from)}-${clock(booking.to)}, ${booking.pax} guest${booking.pax === 1 ? "" : "s"} (${booking.tableNo}). ` +
    `Pay at the restaurant. To change it, call ${prettyContact()} or email ${REPLY_EMAIL}. ${stopLine()}`
  );
}

export function staySms(stay: StayNotice) {
  return (
    `Mila Mirissa: stay ${stay.resId} is booked — ${longDay(stay.checkin)} to ${longDay(stay.checkout)}, ` +
    `${stay.nights} night${stay.nights === 1 ? "" : "s"}, ${stay.rooms.map((room) => room.name).join(" + ")}, ` +
    `${money(stay.total, stay.currency)} to pay on arrival. To change it, call ${prettyContact()} or email ${REPLY_EMAIL}. ${stopLine()}`
  );
}

/* ── sending ──────────────────────────────────────────────────────────── */

/**
 * While testing, MGRemail is often set to the guest's own Gmail — which is fine,
 * both messages land in one inbox, but it should never be a silent surprise.
 */
function noteSameInbox(desk: string, guest: string, kind: string) {
  if (!desk || !guest) return;
  if (desk.trim().toLowerCase() !== guest.trim().toLowerCase()) return;
  console.warn(
    `[notify] ${kind}: MGRemail is the same address as the guest (${desk}). ` +
      `Both emails go to one inbox — set MGRemail to the restaurant's own address in .env.`,
  );
}

async function textGuest(phone: string, message: string): Promise<ChannelResult> {
  const to = internationalDigits(phone);
  if (!to) return "skipped";
  const result = await sendSms(to, message);
  if (result.ok) return result.via === "textlk" ? "sent" : "logged";
  return "failed";
}

/** After a table booking is committed: text the guest, email the guest, email the desk. */
export async function notifyTableBooking(booking: TableNotice): Promise<NotifySummary> {
  const guestMail = booking.email ? tableGuestEmail(booking) : null;
  const deskMail = managerEmail() ? tableManagerEmail(booking) : null;
  noteSameInbox(managerEmail(), booking.email ?? "", "table " + booking.resId);

  const [sms, guest, manager] = await Promise.all([
    textGuest(booking.phone, tableSms(booking)),
    guestMail && booking.email
      ? sendMail({ to: booking.email, replyTo: managerEmail() || REPLY_EMAIL, ...guestMail }).then((r) =>
          r.ok ? (r.via === "smtp" ? "sent" : "logged") : "failed",
        )
      : Promise.resolve<ChannelResult>("skipped"),
    deskMail
      ? sendMail({ to: managerEmail(), replyTo: booking.email || undefined, ...deskMail }).then((r) =>
          r.ok ? (r.via === "smtp" ? "sent" : "logged") : "failed",
        )
      : Promise.resolve<ChannelResult>("skipped"),
  ]);

  if (!mailConfigured()) console.info("[notify] table booking saved; SMTP not configured, so only the text was attempted.");
  return { sms, guest, manager };
}

/** After a stay is committed: the same three, with the stay's own words. */
export async function notifyStayBooking(stay: StayNotice): Promise<NotifySummary> {
  const guestMail = stay.email ? stayGuestEmail(stay) : null;
  const deskMail = managerEmail() ? stayManagerEmail(stay) : null;
  noteSameInbox(managerEmail(), stay.email ?? "", "stay " + stay.resId);

  const [sms, guest, manager] = await Promise.all([
    textGuest(stay.phone, staySms(stay)),
    guestMail && stay.email
      ? sendMail({ to: stay.email, replyTo: managerEmail() || REPLY_EMAIL, ...guestMail }).then((r) =>
          r.ok ? (r.via === "smtp" ? "sent" : "logged") : "failed",
        )
      : Promise.resolve<ChannelResult>("skipped"),
    deskMail
      ? sendMail({ to: managerEmail(), replyTo: stay.email || undefined, ...deskMail }).then((r) =>
          r.ok ? (r.via === "smtp" ? "sent" : "logged") : "failed",
        )
      : Promise.resolve<ChannelResult>("skipped"),
  ]);

  return { sms, guest, manager };
}
