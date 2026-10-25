"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatAsTyped, isSriLankanMobile, prettyPhone } from "../lib/phone";
import { rememberGuest } from "./session";

/**
 * The sign-in popup that stands over the page at the moment of confirming.
 *
 * Phone → a code by SMS (Text.lk) → signed in. The number here is the sign-in
 * number, kept separate from whatever number is written on the booking form;
 * the same number or a different one both work.
 *
 * A number that isn't in Tbl_CustomerMaster doesn't open an account here — the
 * guest is sent to the sign-up screen with everything they typed still parked,
 * creates the account, signs in there, and comes back to finish the booking.
 */

export type SignedInCustomer = {
  name: string;
  phone: string;
  email: string;
  adds: string[];
  locCode?: string;
  cusCode?: string;
};

type Step = "phone" | "code" | "welcome" | "noaccount";

export default function SignInDialog({
  open,
  initialPhone = "",
  intent = "",
  onClose,
  onSignedIn,
  signupHref = "/auth/signup",
  onLeavingForSignup,
}: {
  open: boolean;
  initialPhone?: string;
  /** What is waiting to be confirmed — shown as a courtesy line. */
  intent?: string;
  onClose: () => void;
  onSignedIn: (customer: SignedInCustomer) => void;
  signupHref?: string;
  /** Returns the URL to use — it carries the booking's "come back here". */
  onLeavingForSignup?: () => string | void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [customer, setCustomer] = useState<SignedInCustomer | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adds, setAdds] = useState<string[]>(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [seconds, setSeconds] = useState(0);
  // The popup is drawn on <body>, not inside the booking page: the page's own
  // button and input rules would otherwise restyle it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Start clean every time the popup opens, with the form's number ready to
  // be used or replaced.
  useEffect(() => {
    if (!open) return;
    setStep("phone");
    setPhone(formatAsTyped(initialPhone));
    setCode(["", "", "", "", "", ""]);
    setCustomer(null);
    setError("");
    setNote("");
    setBusy(false);
    setSeconds(0);
    const id = window.setTimeout(() => phoneRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, [open, initialPhone]);

  useEffect(() => {
    if (!open || seconds <= 0) return;
    const id = window.setInterval(() => setSeconds((left) => Math.max(0, left - 1)), 1000);
    return () => window.clearInterval(id);
  }, [open, seconds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const sendCode = async () => {
    if (!isSriLankanMobile(phone)) {
      setError("Enter a Sri Lankan mobile number, e.g. 77 233 6233.");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; message?: string; retryIn?: number; devCode?: string }
        | null;
      // A number that isn't in the book never gets a text — the server says so
      // before any code is made, and the popup opens the create-account step.
      if (data?.reason === "no-account") {
        setStep("noaccount");
        setError("");
        return;
      }
      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "We couldn’t send the code. Please try again.");
        if (data?.retryIn) setSeconds(data.retryIn);
        return;
      }
      setSeconds(60);
      if (data.devCode) {
        setCode(data.devCode.split(""));
        setNote(`Preview mode — the code is ${data.devCode}.`);
      }
      setStep("code");
      window.setTimeout(() => codeRefs.current[0]?.focus(), 80);
    } catch {
      setError("We couldn’t reach the kitchen’s server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (digits = code.join("")) => {
    if (digits.length !== 6) {
      setError("Enter all six digits.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code: digits }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; message?: string; customer?: SignedInCustomer }
        | null;
      if (!response.ok || !data?.ok || !data.customer) {
        if (data?.reason === "no-account") {
          setStep("noaccount");
        } else {
          setError(data?.message ?? "That code doesn’t match. Please try again.");
        }
        setBusy(false);
        return;
      }
      const person = data.customer;
      setCustomer(person);
      setName(person.name);
      setEmail(person.email ?? "");
      setAdds([0, 1, 2, 3].map((i) => person.adds?.[i] ?? ""));
      rememberGuest({ name: person.name, phone: person.phone, email: person.email, adds: person.adds });
      setStep("welcome");
      setNote("");
    } catch {
      setError("We couldn’t check that code just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!customer) return;
    setBusy(true);
    setError("");
    const trimmedAdds = adds.map((line) => line.trim());
    const changed =
      name.trim() !== customer.name ||
      email.trim() !== (customer.email ?? "") ||
      trimmedAdds.some((line, i) => line !== (customer.adds[i] ?? ""));
    let latest = customer;
    if (changed) {
      try {
        const response = await fetch("/api/auth/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), adds: trimmedAdds }),
        });
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; message?: string; customer?: SignedInCustomer }
          | null;
        if (!response.ok || !data?.ok || !data.customer) {
          setError(data?.message ?? "We couldn’t save those details.");
          setBusy(false);
          return;
        }
        latest = data.customer;
      } catch {
        setError("We couldn’t save those details. Please try again.");
        setBusy(false);
        return;
      }
    }
    rememberGuest({ name: latest.name, phone: latest.phone, email: latest.email, adds: latest.adds });
    setBusy(false);
    onSignedIn(latest);
  };

  const goCreate = () => {
    const target = onLeavingForSignup?.() || signupHref;
    onClose();
    router.push(target);
  };

  const setDigit = (index: number, value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setCode((old) => old.map((d, i) => (i === index ? "" : d)));
      return;
    }
    setCode((old) => {
      const next = [...old];
      digits.split("").forEach((digit, offset) => {
        if (index + offset < 6) next[index + offset] = digit;
      });
      return next;
    });
    const jump = Math.min(index + digits.length, 5);
    codeRefs.current[jump]?.focus();
    const joined = [...code.slice(0, index), ...digits.split("").slice(0, 6 - index), ...code.slice(index + digits.length)].join("").replace(/\D/g, "");
    if (joined.length === 6) window.setTimeout(() => void verify(joined), 60);
  };

  return createPortal(
    <div className="sd-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="sd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sd-title"
        ref={dialogRef}
      >
        <button className="sd-close" type="button" onClick={onClose} aria-label="Close">×</button>

        {step === "phone" && (
          <section>
            <p className="sd-eyebrow"><i />Almost there</p>
            <h2 id="sd-title">Which number shall we<br />sign you in <em>with?</em></h2>
            <p className="sd-sub">
              A six-digit code comes by text. This is your <b>sign-in</b> number — it can be the same as the
              {intent ? ` ${intent}’s` : " booking’s"}, or a different one.
            </p>
            <label className="sd-label" htmlFor="sd-phone">Your phone number</label>
            <div className="sd-phone">
              <span className="sd-cc">LK +94</span>
              <input
                id="sd-phone"
                ref={phoneRef}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="77 233 6233"
                value={phone}
                onChange={(event) => { setPhone(formatAsTyped(event.target.value)); setError(""); }}
                onKeyDown={(event) => { if (event.key === "Enter") void sendCode(); }}
              />
            </div>
            {error && <p className="sd-error" role="alert">{error}</p>}
            <button className="sd-btn" type="button" onClick={sendCode} disabled={busy}>
              {busy ? "Sending…" : "Send me a code"} <Arrow />
            </button>
            <p className="sd-note">Texted by Text.lk. We only use it for this booking.</p>
            <div className="sd-switch">
              <span>New here?</span>
              <button type="button" onClick={goCreate}>Create an account</button>
            </div>
          </section>
        )}

        {step === "code" && (
          <section>
            <p className="sd-eyebrow"><i />One more step</p>
            <h2 id="sd-title">Check your <em>messages.</em></h2>
            <p className="sd-sub">A six-digit code is on its way. It stays valid for five minutes.</p>
            <div className="sd-dest">
              <span>+94 {prettyPhone(phone)}</span>
              <button type="button" onClick={() => { setStep("phone"); setError(""); }}>Change number</button>
            </div>
            <label className="sd-label" htmlFor="sd-otp-0">Your code</label>
            <div className="sd-otp">
              {code.map((digit, index) => (
                <input
                  key={index}
                  id={`sd-otp-${index}`}
                  ref={(element) => { codeRefs.current[index] = element; }}
                  value={digit}
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${index + 1} of 6`}
                  maxLength={index === 0 ? 6 : 1}
                  onChange={(event) => setDigit(index, event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Backspace" && !code[index] && index > 0) codeRefs.current[index - 1]?.focus();
                    if (event.key === "ArrowLeft" && index > 0) codeRefs.current[index - 1]?.focus();
                    if (event.key === "ArrowRight" && index < 5) codeRefs.current[index + 1]?.focus();
                    if (event.key === "Enter") void verify();
                  }}
                />
              ))}
            </div>
            {note && <p className="sd-note">{note}</p>}
            {error && <p className="sd-error" role="alert">{error}</p>}
            <button className="sd-btn" type="button" onClick={() => void verify()} disabled={busy}>
              {busy ? "Checking…" : "Verify & sign in"} <Arrow />
            </button>
            <div className="sd-resend">
              <span>Didn’t get it?</span>
              <button type="button" disabled={seconds > 0 || busy} onClick={sendCode}>
                {seconds > 0 ? `Resend in 00:${String(seconds).padStart(2, "0")}` : "Resend code"}
              </button>
            </div>
            <p className="sd-note">Your booking is still here — nothing is lost while you do this.</p>
          </section>
        )}

        {step === "welcome" && customer && (
          <section>
            <p className="sd-eyebrow"><i />Welcome back</p>
            <h2 id="sd-title">Good to see you <em>again.</em></h2>
            <div className="sd-who">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.1" />
                <circle cx="12" cy="9.6" r="2.9" stroke="currentColor" strokeWidth="1.1" />
                <path d="M6.4 18.4c1-2.6 3-4 5.6-4s4.6 1.4 5.6 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
              <div>
                <b>+94 {prettyPhone(customer.phone)}</b>
                <span>Signed in. These come from your account — edit anything you need.</span>
              </div>
            </div>
            <label className="sd-label" htmlFor="sd-name">Name</label>
            <input id="sd-name" className="sd-input" value={name} onChange={(event) => setName(event.target.value)} />
            <label className="sd-label" htmlFor="sd-email">Email <span className="sd-opt">optional</span></label>
            <input id="sd-email" className="sd-input" type="email" value={email} placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
            <label className="sd-label">Your address <span className="sd-opt">at least one line</span></label>
            <input className="sd-input" aria-label={`Address line 1`} value={adds[0]} placeholder="Address line 1 — street, number" onChange={(event) => setAdds((old) => [event.target.value, old[1], old[2], old[3]])} />
            <input className="sd-input" aria-label={`Address line 2`} value={adds[1]} placeholder="Address line 2" onChange={(event) => setAdds((old) => [old[0], event.target.value, old[2], old[3]])} />
            <input className="sd-input" aria-label={`Address line 3`} value={adds[2]} placeholder="Address line 3" onChange={(event) => setAdds((old) => [old[0], old[1], event.target.value, old[3]])} />
            <input className="sd-input" aria-label={`Address line 4`} value={adds[3]} placeholder="Address line 4" onChange={(event) => setAdds((old) => [old[0], old[1], old[2], event.target.value])} />
            <p className="sd-note">The phone number is your account’s key, so it stays as it is.</p>
            {error && <p className="sd-error" role="alert">{error}</p>}
            <button className="sd-btn" type="button" onClick={finish} disabled={busy}>
              {busy ? "Saving…" : "Continue & confirm"} <Arrow />
            </button>
          </section>
        )}

        {step === "noaccount" && (
          <section>
            <p className="sd-eyebrow"><i />Not in the book</p>
            <h2 id="sd-title">This number is <em>new to us.</em></h2>
            <p className="sd-sub">
              There’s no account for <b>+94 {prettyPhone(phone)}</b> yet, so no code has been sent.
              Make one in a moment — you’ll confirm the number with a code, and this booking comes straight back.
            </p>
            <button className="sd-btn" type="button" onClick={goCreate}>Create an account <Arrow /></button>
            <button className="sd-btn is-ghost" type="button" onClick={() => { setStep("phone"); setError(""); }}>
              Try another number
            </button>
            {error && <p className="sd-error" role="alert">{error}</p>}
            <div className="sd-switch">
              <span>Already have one?</span>
              <button type="button" onClick={() => setStep("phone")}>Sign in</button>
            </div>
          </section>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
