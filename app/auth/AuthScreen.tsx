"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatAsTyped, isSriLankanMobile, prettyPhone } from "../../lib/phone";
import { rememberGuest } from "../session";

/**
 * Two screens, and only two.
 *
 *   /auth/login   phone → six-digit code (Text.lk) → signed in
 *   /auth/signup  name, phone, address, email → account → straight to sign in
 *
 * There is no password anywhere, no Google button and no “forgot password”:
 * the code that proves the number is the whole of the sign-in.
 */

export type AuthStage = "login" | "signup";

const safeNext = (raw: string | null) =>
  raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Steps({ active }: { active: 1 | 2 }) {
  const labels = ["Your details", "Your code"];
  return (
    <div className="au-steps" aria-label={`Step ${active} of 2`}>
      {labels.map((label, index) => (
        <span className={index + 1 === active ? "is-active" : ""} key={label}>
          <b>{String(index + 1).padStart(2, "0")}</b>
          {label}
        </span>
      ))}
    </div>
  );
}

export default function AuthScreen({ stage }: { stage: AuthStage }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adds, setAdds] = useState<string[]>(["", "", ""]);
  const [consent, setConsent] = useState(false);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);

  const [stageCode, setStageCode] = useState(false);
  // Sign up in two beats: the details, then the code that proves the number.
  const [signupSent, setSignupSent] = useState(false);
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noAccount, setNoAccount] = useState(false);

  const phones = useRef<HTMLInputElement>(null);
  const digits = useRef<(HTMLInputElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const fromUrl = params.get("phone");
    if (fromUrl) setPhone(formatAsTyped(fromUrl));
  }, [params]);

  useEffect(() => {
    if (!stageCode || seconds <= 0) return;
    const id = window.setInterval(() => setSeconds((left) => Math.max(0, left - 1)), 1000);
    return () => window.clearInterval(id);
  }, [stageCode, seconds]);

  useEffect(() => {
    if (legal) dialog.current?.showModal();
  }, [legal]);

  const sendCode = async (purpose: "signin" | "signup" = "signin") => {
    // Before a sign-up code is sent, the form must be worth sending it for.
    if (purpose === "signup") {
      if (name.trim().length < 2) {
        setError("Please enter your name.");
        return;
      }
      if (!adds[0].trim()) {
        setError("Please enter at least the first line of your address.");
        return;
      }
      if (!consent) {
        setError("Please acknowledge the terms and privacy information.");
        return;
      }
    }
    if (!isSriLankanMobile(phone)) {
      setError("Enter a Sri Lankan mobile number, e.g. 77 233 6233.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setNoAccount(false);
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, purpose }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; message?: string; retryIn?: number; devCode?: string }
        | null;
      // An unknown number is answered before any text is sent.
      if (purpose === "signin" && data?.reason === "no-account") {
        setNoAccount(true);
        setError("");
        return;
      }
      if (purpose === "signup" && data?.reason === "has-account") {
        setError("");
        setNoAccount(true);
        return;
      }
      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "We couldn’t send the code. Please try again.");
        if (data?.retryIn) setSeconds(data.retryIn);
        return;
      }
      setSeconds(60);
      if (purpose === "signup") setSignupSent(true);
      else setStageCode(true);
      if (data.devCode) {
        setCode(data.devCode.split(""));
        setNotice(`Preview mode — the code is ${data.devCode}.`);
      }
      window.setTimeout(() => digits.current[0]?.focus(), 80);
    } catch {
      setError("We couldn’t reach the kitchen’s server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code.join("")) => {
    if (value.length !== 6) {
      setError("Enter all six digits.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code: value }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; message?: string; customer?: { name: string; phone: string; email?: string; adds?: string[] } }
        | null;
      if (!response.ok || !data?.ok || !data.customer) {
        if (data?.reason === "no-account") setNoAccount(true);
        setError(data?.message ?? "That code doesn’t match. Please try again.");
        return;
      }
      rememberGuest({
        name: data.customer.name,
        phone: data.customer.phone,
        email: data.customer.email,
        adds: data.customer.adds,
      });
      router.push(next || "/reserve");
    } catch {
      setError("We couldn’t check that code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * The last step of a sign-up: the code is checked and the account is written
   * in the same call. A wrong or expired code leaves the book untouched.
   */
  const createAccount = async (value?: string) => {
    const typed = value ?? code.join("");
    if (typed.length !== 6) {
      setError("Enter the six-digit code we texted you.");
      return;
    }
    if (!consent) {
      setError("Please acknowledge the terms and privacy information.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone, adds, email, code: typed }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; message?: string; customer?: { name: string; phone: string; email?: string; adds?: string[] } }
        | null;
      if (!response.ok || !data?.ok || !data.customer) {
        setError(data?.message ?? "We couldn’t create the account. Please try again.");
        if (data?.reason === "bad-code" && /expired|used|new one|first/i.test(data.message ?? "")) {
          // That code is spent — go back to the details so a new one can be sent.
          setSignupSent(false);
          setCode(["", "", "", "", "", ""]);
        }
        return;
      }
      rememberGuest({
        name: data.customer.name,
        phone: data.customer.phone,
        email: data.customer.email,
        adds: data.customer.adds,
      });
      router.push(next || "/reserve");
    } catch {
      setError("We couldn’t reach the kitchen’s server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      setCode((old) => old.map((digit, i) => (i === index ? "" : digit)));
      return;
    }
    setCode((old) => {
      const copy = [...old];
      clean.split("").forEach((digit, offset) => {
        if (index + offset < 6) copy[index + offset] = digit;
      });
      return copy;
    });
    const jump = Math.min(index + clean.length, 5);
    digits.current[jump]?.focus();
    const joined = code
      .map((digit, i) => (i >= index && i < index + clean.length ? clean[i - index] : digit))
      .join("");
    if (joined.length === 6) {
      window.setTimeout(() => {
        if (stage === "signup") void createAccount(joined);
        else void verify(joined);
      }, 60);
    }
  };

  const phoneField = (label = "Phone number") => (
    <div className="au-field">
      <label htmlFor="phone">{label}</label>
      <div className="au-phone">
        <span className="au-cc" aria-hidden="true">LK +94</span>
        <input
          id="phone"
          ref={phones}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="77 233 6233"
          value={phone}
          maxLength={12}
          onChange={(event) => {
            setPhone(formatAsTyped(event.target.value));
            setError("");
            setNoAccount(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !stageCode) {
              event.preventDefault();
              void sendCode();
            }
          }}
        />
      </div>
      {error && !stageCode && <p className="au-error" role="alert">{error}</p>}
      {noAccount && stage === "login" && (
        <p className="au-error" role="alert">
          That number isn’t in our book yet.{" "}
          <Link href={`/auth/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link> to continue.
        </p>
      )}
    </div>
  );

  const login = (
    <>
      {stageCode ? (
        <>
          <div className="au-destination">
            <span>+94 {prettyPhone(phone)}</span>
            <button type="button" className="au-change" onClick={() => { setStageCode(false); setCode(["", "", "", "", "", ""]); setError(""); }}>
              Change number
            </button>
          </div>
          <label className="au-code-label" id="code-label">Your verification code</label>
          <div className="au-otp" role="group" aria-labelledby="code-label">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(element) => { digits.current[index] = element; }}
                id={`otp-${index}`}
                value={digit}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={index === 0 ? 6 : 1}
                aria-label={`Digit ${index + 1} of 6`}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setDigit(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && !code[index] && index > 0) digits.current[index - 1]?.focus();
                  if (event.key === "Enter") { event.preventDefault(); void verify(); }
                }}
              />
            ))}
          </div>
          {error && <p className="au-error" role="alert">{error}</p>}
          <button className="au-primary" type="button" disabled={busy} onClick={() => void verify()}>
            {busy ? "Checking…" : "Verify & sign in"} <Arrow />
          </button>
          <div className="au-resend">
            <span>{seconds > 0 ? `Resend in 00:${String(seconds).padStart(2, "0")}` : "Didn’t get a code?"}</span>
            <button type="button" disabled={seconds > 0 || busy} onClick={() => void sendCode("signin")}>Resend code</button>
          </div>
        </>
      ) : (
        <>
          {phoneField()}
          <button className="au-primary" type="button" disabled={busy} onClick={() => void sendCode("signin")}>
            {busy ? "Sending…" : "Send me a code"} <Arrow />
          </button>
          <p className="au-hint" style={{ marginTop: 16 }}>
            A six-digit code arrives by text — no password to remember. It is valid for five minutes.
          </p>
        </>
      )}
    </>
  );

  const signupDetails = (
    <>
      <div className="au-field">
        <label htmlFor="full-name">Your name</label>
        <input
          id="full-name"
          name="name"
          autoComplete="name"
          value={name}
          maxLength={80}
          placeholder="What should we call you?"
          onChange={(event) => { setName(event.target.value); setError(""); }}
        />
      </div>
      {phoneField()}
      <div className="au-field">
        <label>Your address</label>
        <p className="au-hint" style={{ margin: "-4px 0 10px" }}>
          One line is enough — up to four lines are kept.
        </p>
        {adds.map((line, index) => (
          <input
            key={index}
            className="au-line"
            value={line}
            maxLength={200}
            placeholder={index === 0 ? "Address line 1 — street, number" : `Address line ${index + 1}`}
            aria-label={`Address line ${index + 1}`}
            onChange={(event) => {
              const copy = [...adds];
              copy[index] = event.target.value;
              setAdds(copy);
              setError("");
            }}
            style={{ marginBottom: 8 }}
          />
        ))}
        {adds.length < 4 && (
          <button type="button" className="au-addline" onClick={() => setAdds([...adds, ""])}>
            + Add another address line
          </button>
        )}
      </div>
      <div className="au-field">
        <label htmlFor="email">Email <span className="au-optional">optional</span></label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          maxLength={200}
          placeholder="you@example.com"
          onChange={(event) => { setEmail(event.target.value); setError(""); }}
        />
      </div>
      <label className="au-terms">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => { setConsent(event.target.checked); setError(""); }}
        />
        <span>
          I agree to the <button type="button" onClick={() => setLegal("terms")}>Terms</button> and{" "}
          <button type="button" onClick={() => setLegal("privacy")}>Privacy Notice</button>.
        </span>
      </label>
      {error && <p className="au-error" role="alert">{error}</p>}
      <button className="au-primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send my code"} <Arrow />
      </button>
      <p className="au-hint" style={{ marginTop: 14 }}>
        We text a six-digit code to this number. The account is written only once you type it in.
      </p>
    </>
  );

  // Step two: the number proves itself, and the account is written in one go.
  const signupCode = (
    <>
      <div className="au-destination">
        <span>{name.trim() || "Your account"} · +94 {prettyPhone(phone)}</span>
        <button
          type="button"
          className="au-change"
          onClick={() => {
            setSignupSent(false);
            setCode(["", "", "", "", "", ""]);
            setError("");
            setNotice("");
          }}
        >
          Change details
        </button>
      </div>
      <label className="au-code-label" id="signup-code-label">Your verification code</label>
      <div className="au-otp" role="group" aria-labelledby="signup-code-label">
        {code.map((digit, index) => (
          <input
            key={index}
            ref={(element) => { digits.current[index] = element; }}
            id={`signup-otp-${index}`}
            value={digit}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={index === 0 ? 6 : 1}
            aria-label={`Digit ${index + 1} of 6`}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !code[index] && index > 0) digits.current[index - 1]?.focus();
              if (event.key === "Enter") { event.preventDefault(); void createAccount(); }
            }}
          />
        ))}
      </div>
      {error && <p className="au-error" role="alert">{error}</p>}
      <button className="au-primary" type="submit" disabled={busy}>
        {busy ? "Checking…" : "Verify & create my account"} <Arrow />
      </button>
      <div className="au-resend">
        <span>{seconds > 0 ? `Resend in 00:${String(seconds).padStart(2, "0")}` : "Didn’t get a code?"}</span>
        <button type="button" disabled={seconds > 0 || busy} onClick={() => void sendCode("signup")}>
          Resend code
        </button>
      </div>
      <p className="au-hint" style={{ marginTop: 14 }}>
        Nothing is written until this code checks out. Once it does, you’re signed in and straight back to
        {" "}your booking.
      </p>
    </>
  );

  const signup = signupSent ? signupCode : signupDetails;

  return (
    <div className="au-website">
      <Link className="skip-link" href="#auth-main">Skip to content</Link>
      <header className="au-header">
        <Link href="/" className="au-brand">
          <Image className="au-brand__logo" src="/images/mila-mirissa-logo-sm.png" alt="" width={96} height={96} aria-hidden="true" />
          <span className="au-brand__text">Mila Mirissa<small>KITCHEN &amp; GOOD COMPANY</small></span>
        </Link>
        <Link className="au-back" href="/"><span aria-hidden="true">←</span> Back to restaurant</Link>
      </header>
      <main id="auth-main" className="au-layout">
        <aside className="au-atmosphere" aria-label="Restaurant atmosphere">
          <div className="au-image">
            <Image
              src="/images/restaurant.jpg"
              alt="Warm restaurant interior with olive banquettes and sunlit tables"
              width={1376}
              height={768}
              sizes="(max-width:767px) 1px,50vw"
              loading="eager"
            />
            <div className="au-photo-copy">
              <span className="au-eyebrow">A LITTLE PAUSE. A LOVELY MEAL.</span>
              <h2>Good food.<br /><em>Good company.</em></h2>
              <p>Your next little occasion starts<br />with a warm welcome.</p>
            </div>
          </div>
          <div className="au-caption"><span>Good food. Made for good company.</span><em>Pull up a chair.</em></div>
        </aside>

        <section className="au-form-area" aria-labelledby="auth-heading">
          {stage === "signup" && <Steps active={signupSent ? 2 : 1} />}
          <span className="au-eyebrow">{stage === "signup" ? "CREATE ACCOUNT" : "SIGN IN"}</span>
          <h1 id="auth-heading">
            {stage === "signup"
              ? (signupSent ? <>One code, then <em>you’re in.</em></> : <>A short hello <em>first.</em></>)
              : <>Welcome <em>back.</em></>}
          </h1>
          <p className="au-intro">
            {stage === "signup"
              ? (signupSent
                ? `A six-digit code is on its way to +94 ${prettyPhone(phone)}. Type it in and the account is made.`
                : "Four things and you’re in. We’ll text a code to confirm the number — no password to invent or remember.")
              : "Enter the number on your account and we’ll text a six-digit code. That’s the whole of it."}
          </p>

          {notice && (stageCode || signupSent) && <p className="au-status" role="status">{notice}</p>}

          <form
            noValidate
            method="post"
            onSubmit={(event) => {
              event.preventDefault();
              if (stage === "signup") {
                if (signupSent) void createAccount();
                else void sendCode("signup");
              } else if (stageCode) void verify();
              else void sendCode("signin");
            }}
          >
            {stage === "signup" ? signup : login}
          </form>

          {stage === "login" ? (
            <p className="au-switch">
              New here?
              <Link href={`/auth/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
            </p>
          ) : (
            <p className="au-switch">
              Already part of the table?
              <Link href={`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Log in</Link>
            </p>
          )}
          <p className="au-guest">
            We text one code per sign-in, through Text.lk. The number on your booking is kept separately — you can
            sign in with a different one.
          </p>
        </section>
      </main>

      <dialog ref={dialog} className="au-dialog" aria-labelledby="legal-title" onClose={() => setLegal(null)}>
        <button type="button" className="au-close" aria-label="Close information" onClick={() => dialog.current?.close()}>×</button>
        <h2 id="legal-title">{legal === "terms" ? "A thoughtful welcome." : "Your details, with care."}</h2>
        <p>
          {legal === "terms"
            ? "An account is a name, a phone number, an address and — if you wish — an email. The restaurant keeps them to take your order and to hold your table. Final terms must be provided by the restaurant before launch."
            : "Your details are kept in the restaurant’s own customer book and used for your orders and bookings. The sign-in code is sent by SMS; nothing else is shared. The restaurant’s final privacy policy must be confirmed before launch."}
        </p>
        <button type="button" className="au-primary" onClick={() => dialog.current?.close()}>Got it <Arrow /></button>
      </dialog>
    </div>
  );
}
