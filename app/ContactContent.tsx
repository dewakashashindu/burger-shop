"use client";

import Link from "next/link";

/**
 * /contact — the page behind "Contact us".
 *
 * Three ways to reach the kitchen, in the order most guests use them:
 * WhatsApp (fastest), email (anything planned ahead), and a direct call to
 * either number. Every value is a real link, not a picture of one.
 */

const PHONES = ["0772336233", "0771096131"] as const;
const WHATSAPP = "94771096131"; // 0771096131 with the country code, as wa.me expects
const EMAIL = "hello.milamirissa@gmail.com";

const WA_TEXT = encodeURIComponent(
  "Hello Mila Mirissā! I'd like to ask about a table.",
);
const MAIL_SUBJECT = encodeURIComponent("Hello Mila Mirissā");
const MAIL_BODY = encodeURIComponent(
  "Hello,\n\nI'd like to ask about …\n\nName:\nDate:\nNumber of guests:\n",
);

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L3.8 20.2l1.3-4.2A8.2 8.2 0 1 1 20.2 11.7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M9 8.4h1.5l.9 2.3-1.1.8a6.2 6.2 0 0 0 3.2 3.2l.8-1.1 2.3.9V15a1.5 1.5 0 0 1-1.6 1.4 9.3 9.3 0 0 1-7.4-7.4A1.5 1.5 0 0 1 9 8.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="m4.4 7.2 6.5 5.1a1.8 1.8 0 0 0 2.2 0l6.5-5.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.2 4.6h2.1l1.5 3.6-1.9 1.3a10.6 10.6 0 0 0 5.6 5.6l1.3-1.9 3.6 1.5v2.1a2.4 2.4 0 0 1-2.6 2.4A15.7 15.7 0 0 1 4.8 7.2a2.4 2.4 0 0 1 2.4-2.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21s6.4-5.6 6.4-10.4A6.4 6.4 0 0 0 5.6 10.6C5.6 15.4 12 21 12 21Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="12" cy="10.4" r="2.3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function Arrow() {
  return (
    <svg className="ct-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ContactContent() {
  return (
    <div className="ct-page">
      <section className="ct-hero">
        <span className="ct-eyebrow">CONTACT US</span>
        <h1>
          Come and <em>say hello.</em>
        </h1>
        <p className="ct-lede">
          A little kitchen in Mirissa. Message us, mail us, or simply call —
          someone is usually a few steps from the phone.
        </p>
      </section>

      <section className="ct-actions" aria-label="Ways to reach us">
        <a
          className="ct-card ct-card--wa"
          href={`https://wa.me/${WHATSAPP}?text=${WA_TEXT}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="ct-card__top">
            <span className="ct-icon ct-icon--wa">
              <WhatsAppIcon />
            </span>
            <span className="ct-badge">Quickest reply</span>
          </span>
          <span className="ct-card__label">WHATSAPP</span>
          <strong className="ct-card__value">Message 0771096131</strong>
          <span className="ct-card__hint">
            Send a message and we’ll write back — tables, rooms, takeaway.
          </span>
          <span className="ct-card__cta">
            Open WhatsApp <Arrow />
          </span>
        </a>

        <a
          className="ct-card"
          href={`mailto:${EMAIL}?subject=${MAIL_SUBJECT}&body=${MAIL_BODY}`}
        >
          <span className="ct-card__top">
            <span className="ct-icon">
              <MailIcon />
            </span>
          </span>
          <span className="ct-card__label">EMAIL</span>
          <strong className="ct-card__value ct-card__value--sm">{EMAIL}</strong>
          <span className="ct-card__hint">
            For rooms, larger tables and anything planned a little ahead.
          </span>
          <span className="ct-card__cta">
            Write an email <Arrow />
          </span>
        </a>

        <div className="ct-card ct-card--call">
          <span className="ct-card__top">
            <span className="ct-icon">
              <PhoneIcon />
            </span>
          </span>
          <span className="ct-card__label">DIRECT CALL</span>
          <span className="ct-card__calls">
            {PHONES.map((phone) => (
              <a key={phone} className="ct-call" href={`tel:${phone}`}>
                <span>{phone}</span>
                <span className="ct-call__hint">tap to call</span>
              </a>
            ))}
          </span>
          <span className="ct-card__hint">
            For a table today, a quick call is still the surest thing.
          </span>
        </div>
      </section>

      <section className="ct-find" aria-label="Where to find us">
        <div className="ct-find__row">
          <span className="ct-icon ct-icon--pin">
            <PinIcon />
          </span>
          <div>
            <span className="ct-card__label">FIND US</span>
            <strong className="ct-find__value">Mirissa, Sri Lanka</strong>
            <span className="ct-find__hint">
              The kitchen takes tables, rooms and takeaway — call or write and
              we’ll point you the right way.
            </span>
          </div>
        </div>
        <div className="ct-find__side">
          <span className="ct-card__label">PREFER TO BOOK ONLINE?</span>
          <Link className="ct-find__book" href="/reserve?view=reserve">
            Find your table <Arrow />
          </Link>
        </div>
      </section>

      <p className="ct-note">
        We answer during kitchen hours. If nobody picks up, a WhatsApp message
        reaches us the moment it’s quiet again.
      </p>
    </div>
  );
}
