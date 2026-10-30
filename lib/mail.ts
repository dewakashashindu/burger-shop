/**
 * SMTP — the booking confirmation that lands in an inbox.
 *
 * Reads the same names the desk already uses in .env:
 *
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false          (true for port 465)
 *   SMTP_USER=…
 *   SMTP_PASS=…                (a Gmail App Password, not the login password)
 *   SMTP_FROM="Mila Mirissa" <you@gmail.com>
 *   MGRemail=…                 (the restaurant's own inbox)
 *
 * `nodemailer` is loaded at runtime, the way `mssql` is: if it is not installed,
 * or the settings are missing, mail is simply not sent — the booking has already
 * been saved, and the log says exactly why. Nothing is ever pretended.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** An image that travels inside the message — a logo, not a link to one. */
export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** `cid` is what `<img src="cid:…">` points at. */
  cid?: string;
};

export type MailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: MailAttachment[];
};

export type MailResult = { ok: true; via: "smtp" | "log" } | { ok: false; reason: string };

const clean = (value: string | undefined) => (value ?? "").trim();

/* ── the embedded emblem ───────────────────────────────────────────────── */

/** The `cid:` name the email HTML points at. */
export const LOGO_CID = "mila-mirissa-logo";
const LOGO_FILE = "public/images/mila-mirissa-logo-sm.png";

type LogoStore = typeof globalThis & { __milaLogo?: MailAttachment | null };

/**
 * The round Mila Mirissa emblem, read from `public/` once per process. It is
 * attached *inside* the message under a `cid:` name rather than linked, which is
 * the only way a logo survives an inbox that blocks remote images.
 *
 * `null` when the file is not there (a slim deployment) — the emails still go.
 */
export function logoAttachment(): MailAttachment | null {
  const store = globalThis as LogoStore;
  if (store.__milaLogo !== undefined) return store.__milaLogo;
  try {
    const content = readFileSync(join(process.cwd(), LOGO_FILE));
    store.__milaLogo = { filename: "mila-mirissa-logo.png", content, contentType: "image/png", cid: LOGO_CID };
  } catch {
    store.__milaLogo = null;
  }
  return store.__milaLogo;
}

/**
 * If the HTML asks for `cid:` images and the caller did not bring any, the
 * emblem is attached automatically. Losing the logo because one call site
 * forgot to pass `attachments` is not a failure the sender should have to see.
 */
function withEmblem(input: MailInput): MailAttachment[] | undefined {
  if (input.attachments?.length) return input.attachments;
  if (!/\bcid:/.test(input.html)) return undefined;
  const emblem = logoAttachment();
  return emblem ? [emblem] : undefined;
}

export const mailConfigured = () =>
  Boolean(clean(process.env.SMTP_HOST) && clean(process.env.SMTP_USER) && clean(process.env.SMTP_PASS));

/** The from line, defaulting to "Mila Mirissa <SMTP_USER>" when only a user is given. */
export function fromLine(): string {
  const given = clean(process.env.SMTP_FROM);
  if (given) return given;
  const user = clean(process.env.SMTP_USER);
  return user ? `"Mila Mirissa" <${user}>` : "";
}

/** The inbox the restaurant reads: MGRemail, or the shop's own Gmail. */
export const FALLBACK_DESK_EMAIL = "hello.milamirissa@gmail.com";

/**
 * Where the restaurant's own copy goes: MGRemail in .env, falling back to the
 * shop's Gmail so "a new booking arrived" is never silently dropped — the desk
 * copy is the only message the restaurant gets (no text is sent to the desk).
 */
export const managerEmail = () => clean(process.env.MGRemail) || FALLBACK_DESK_EMAIL;

type Transport = {
  sendMail(message: Record<string, unknown>): Promise<unknown>;
  verify?(): Promise<unknown>;
  close?(): void;
};

type Nodemailer = {
  createTransport(options: Record<string, unknown>): Transport;
  default?: Nodemailer;
};

type MailStore = typeof globalThis & { __milaMailer?: Transport | null };
const store = globalThis as MailStore;

function resolveNodemailer(): Nodemailer | null {
  try {
    // Resolved from the project folder, the way lib/db.ts finds mssql — the
    // packaged output lives in a nested folder on some machines.
    const requireFromProject = createRequire(pathToFileURL(join(process.cwd(), "package.json")));
    const loaded = requireFromProject("nodemailer") as Nodemailer & { default?: Nodemailer };
    const resolved = (loaded?.default ?? loaded) as Nodemailer | undefined;
    return resolved && typeof resolved.createTransport === "function" ? resolved : null;
  } catch {
    return null;
  }
}

function transport(): Transport | null {
  if (store.__milaMailer !== undefined) return store.__milaMailer;

  if (!mailConfigured()) {
    console.info("[mail] SMTP_HOST / SMTP_USER / SMTP_PASS not set — booking emails are written to the log only.");
    store.__milaMailer = null;
    return null;
  }

  const nodemailer = resolveNodemailer();
  if (!nodemailer) {
    console.warn("[mail] nodemailer is not installed — run `npm install` to send booking emails.");
    store.__milaMailer = null;
    return null;
  }

  const port = Number(clean(process.env.SMTP_PORT) || 587);
  const secure = ["1", "true", "yes", "on"].includes(clean(process.env.SMTP_SECURE).toLowerCase());

  store.__milaMailer = nodemailer.createTransport({
    host: clean(process.env.SMTP_HOST),
    port,
    secure,
    auth: { user: clean(process.env.SMTP_USER), pass: clean(process.env.SMTP_PASS) },
    // A minute is plenty for a booking email; the guest never waits on it.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return store.__milaMailer;
}

/**
 * Sends one message. Never throws: the caller is a booking that has already been
 * written, so a mail server having a bad afternoon must not look like a failed
 * reservation.
 */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const to = (Array.isArray(input.to) ? input.to : [input.to]).map(clean).filter(Boolean);
  if (!to.length) return { ok: false, reason: "no-address" };

  const message = {
    from: fromLine(),
    to: to.join(", "),
    replyTo: input.replyTo ? clean(input.replyTo) : undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: withEmblem(input),
  };

  const mailer = transport();
  if (!mailer) {
    // A preview machine has no SMTP: print the message so it can be read.
    console.info(
      `[mail] (not sent — SMTP not configured)\n  to: ${to.join(", ")}\n  subject: ${input.subject}\n  ---\n${input.text}\n  ---`,
    );
    return { ok: true, via: "log" };
  }

  try {
    await mailer.sendMail(message);
    return { ok: true, via: "smtp" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[mail] ${input.subject} → ${to.join(", ")} failed: ${reason}`);
    return { ok: false, reason };
  }
}
