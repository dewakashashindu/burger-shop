"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { getAuthDraft, getServerAuthDraft, subscribeAuthDraft, updateAuthDraft } from "./auth-draft";
import { rememberGuest } from "../session";

export type AuthStage = "login" | "signup" | "forgot-password" | "otp" | "verify-phone" | "reset-password";
const route = (stage: AuthStage) => `/auth/${stage}`;
const unavailable = {
  login: "Sign-in is not connected yet. No credentials have been checked and no account has been accessed.",
  google: "Google sign-in is not connected yet. No Google account has been accessed.",
  sms: "SMS verification is not connected yet. No code has been sent.",
  verify: "Code verification is not connected yet. This code has not been verified.",
  reset: "Password reset is not connected yet. Your password has not been changed.",
};
function Arrow() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function Eye({ hidden }: { hidden: boolean }) { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{hidden ? <><path d="m3 3 18 18M9.8 6.3A11 11 0 0 1 12 6c6.2 0 9.5 6 9.5 6a15 15 0 0 1-3.4 3.8M6.2 7.7A16 16 0 0 0 2.5 12s3.3 6 9.5 6a11 11 0 0 0 3.1-.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M10.2 10.2a2.6 2.6 0 0 0 3.6 3.6" stroke="currentColor" strokeWidth="1.4" /></> : <><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.4" /></>}</svg>; }
function GoogleMark() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92c-.26 1.28-1.04 2.37-2.21 3.1v2.58h3.57c2.08-1.92 3.28-4.74 3.28-7.55Z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.58c-.98.66-2.24 1.06-3.71 1.06-2.87 0-5.3-1.94-6.17-4.54H2.15v2.67A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.83 14.28A6.6 6.6 0 0 1 5.48 12c0-.79.14-1.56.35-2.28V7.05H2.15A11 11 0 0 0 1 12c0 1.78.42 3.46 1.15 4.95l3.68-2.67Z" /><path fill="#EA4335" d="M12 5.18c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1a11 11 0 0 0-9.85 6.05l3.68 2.67C6.7 7.12 9.13 5.18 12 5.18Z" /></svg>; }
function clearSecrets() { document.querySelectorAll<HTMLInputElement>(".auth-page-shell input[data-secret]").forEach(input => { input.value = ""; }); }
function PasswordField({ name, label, error, onEdit, forgot = false }: { name: string; label: string; error?: string; onEdit: () => void; forgot?: boolean }) {
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return <div className="au-field"><div className="au-field-row"><label htmlFor={name}>{label}</label>{forgot && <Link href={route("forgot-password")} onClick={clearSecrets}>Forgot password?</Link>}</div><div className="au-password"><input ref={input} id={name} name={name} data-secret type={shown ? "text" : "password"} autoComplete={name === "password" && forgot ? "current-password" : "new-password"} maxLength={128} placeholder={name === "confirm-password" ? "Re-enter your password" : label === "New password" ? "Enter your new password" : "Enter your password"} aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} onChange={onEdit} /><button type="button" className="au-eye" aria-label={`${shown ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={shown} onClick={() => { setShown(!shown); input.current?.focus({ preventScroll: true }); }}><Eye hidden={shown} /></button></div>{error && <p className="au-error" id={`${name}-error`} role="alert">{error}</p>}</div>;
}
function Steps({ stage }: { stage: AuthStage }) {
  const reset = ["forgot-password", "otp", "reset-password"].includes(stage);
  const labels = reset ? ["Your number", "OTP code", "New password"] : ["Your details", "Verify phone"];
  const active = stage === "reset-password" ? 3 : stage === "otp" || stage === "verify-phone" ? 2 : 1;
  return <div className="au-steps" aria-label={`Step ${active} of ${labels.length}`}>{labels.map((label, i) => <span className={i + 1 === active ? "is-active" : ""} key={label}><b>{String(i + 1).padStart(2, "0")}</b>{label}</span>)}</div>;
}

export default function AuthScreen({ stage }: { stage: AuthStage }) {
  const router = useRouter();
  const params = useSearchParams();
  // Where to go after signing in — the guest may have been sent here mid-order.
  const next = (() => {
    const raw = params.get("next") ?? "";
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/reserve";
  })();
  const draft = useSyncExternalStore(subscribeAuthDraft, getAuthDraft, getServerAuthDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [consent, setConsent] = useState(false);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const otp = stage === "otp" || stage === "verify-phone";
  useEffect(() => { if (!otp) return; const id = setInterval(() => setSeconds(old => Math.max(0, old - 1)), 1000); return () => clearInterval(id); }, [otp]);
  useEffect(() => () => clearSecrets(), []);
  useEffect(() => { if (legal) dialog.current?.showModal(); }, [legal]);
  const edit = (name: string) => { setErrors(old => { const next = { ...old }; delete next[name]; return next; }); setStatus(""); };
  const fail = (name: string, message: string) => { setErrors(old => ({ ...old, [name]: message })); requestAnimationFrame(() => document.getElementById(name)?.focus()); };
  const checkPhone = () => {
    let digits = draft.phone.replace(/\D/g, ""); if (draft.phone.trim().startsWith("+") && digits.startsWith(draft.country.slice(1))) digits = digits.slice(draft.country.length - 1); if (digits.startsWith("0")) digits = digits.slice(1);
    const patterns: Record<string, RegExp> = { "+94": /^7\d{8}$/, "+91": /^[6-9]\d{9}$/, "+44": /^7\d{9}$/, "+971": /^5\d{8}$/ };
    if (!patterns[draft.country]?.test(digits) || !/^\+?[\d\s().-]+$/.test(draft.phone.trim())) { fail("phone", "Check your country code and enter a valid mobile number."); return false; } return true;
  };
  const checkPassword = (form: FormData, confirmation: boolean) => {
    const password = String(form.get("password") || "");
    if (password.length < 8 || !password.trim()) { fail("password", "Use at least 8 characters."); return false; }
    if (confirmation && password !== form.get("confirm-password")) { fail("confirm-password", "The passwords don’t match. Please try again."); return false; } return true;
  };
  const go = (next: AuthStage, notice: string) => { clearSecrets(); updateAuthDraft({ notice }); router.push(route(next)); };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus(""); const form = new FormData(event.currentTarget);
    if (stage === "login") {
      // Sign-in isn't connected yet, so the preview lets any phone + password through to /reserve.
      const password = String(form.get("password") || "");
      if (!draft.phone.trim()) { fail("phone", "Enter your phone number."); return; }
      if (!password) { fail("password", "Enter your password."); return; }
      // No credential is checked yet — this only remembers the tab.
      rememberGuest({ name: draft.name, phone: draft.phone });
      clearSecrets();
      router.push(next);
      return;
    }
    if (stage === "signup") {
      if (draft.name.trim().length < 2) { fail("full-name", "Please enter your name."); return; }
      if (!checkPhone() || !checkPassword(form, true)) return;
      if (!consent) { fail("consent", "Please acknowledge the terms and privacy information."); return; }
      go("verify-phone", unavailable.sms); return;
    }
    if (stage === "forgot-password") { if (checkPhone()) go("otp", unavailable.sms); return; }
    if (otp) {
      const code = inputs.current.map(input => input?.value || "").join("");
      if (!/^\d{6}$/.test(code)) { fail("otp-0", "Enter all six digits to continue."); return; }
      inputs.current.forEach(input => { if (input) input.value = ""; });
      // UI transition only. Never issue a reset token, session or account here.
      if (stage === "otp") go("reset-password", unavailable.verify);
      else setStatus("Phone verification is not connected yet. No account has been created.");
      return;
    }
    if (checkPassword(form, true)) { clearSecrets(); setStatus(unavailable.reset); }
  }
  const phoneField = (label = "Phone number") => <div className="au-field"><label htmlFor="phone">{label}</label><div className="au-phone"><select aria-label="Country calling code" value={draft.country} onChange={event => { updateAuthDraft({ country: event.target.value }); edit("phone"); }}><option value="+94">LK +94</option><option value="+91">IN +91</option><option value="+44">UK +44</option><option value="+971">AE +971</option></select><input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder={draft.country === "+94" ? "77 123 4567" : "Mobile number"} value={draft.phone} onChange={event => { updateAuthDraft({ phone: event.target.value }); edit("phone"); }} maxLength={22} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : undefined} /></div>{errors.phone && <p className="au-error" id="phone-error" role="alert">{errors.phone}</p>}</div>;
  const passwordFields = (confirm: boolean, reset = false) => <><PasswordField name="password" label={reset ? "New password" : "Password"} error={errors.password} onEdit={() => edit("password")} forgot={stage === "login"} />{confirm && <PasswordField name="confirm-password" label="Confirm password" error={errors["confirm-password"]} onEdit={() => edit("confirm-password")} />}{confirm && <p className="au-hint">At least 8 characters.</p>}</>;
  const action = (text: string) => <button className="au-primary" type="submit" onClick={event => { event.preventDefault(); event.currentTarget.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }}><span>{text}</span><Arrow /></button>;
  const social = <div className="au-social"><div className="au-divider"><span>or</span></div><button className="au-google" type="button" onClick={() => { clearSecrets(); setStatus(unavailable.google); }}><span className="au-google-circle"><GoogleMark /></span><span>Continue with Google</span></button></div>;
  const switchLine = (text: string, label: string, target: AuthStage) => <p className="au-switch">{text} <Link href={route(target)} onClick={clearSecrets}>{label}</Link></p>;
  const masked = draft.phone ? `${draft.country} ••• •• ${draft.phone.replace(/\D/g, "").slice(-4)}` : "Your phone number";
  let heading: ReactNode, description: ReactNode, eyebrow: string;
  if (stage === "login") { eyebrow = "YOUR PLACE AT THE TABLE"; heading = <>Good to see<br /><em>you again.</em></>; description = <>Your next little occasion starts here.<br />Log in with your phone number and password.</>; }
  else if (stage === "signup") { eyebrow = "THERE’S ALWAYS ROOM FOR YOU"; heading = <>Make yourself<br /><em>at home.</em></>; description = <>Create your account, then verify your phone.</>; }
  else if (stage === "forgot-password") { eyebrow = "A LITTLE HELP, WHEN YOU NEED IT"; heading = <>Forgot your<br /><em>password?</em></>; description = "Enter the phone number on your account to start a password reset."; }
  else if (otp) { eyebrow = stage === "otp" ? "RESET YOUR PASSWORD / VERIFY PHONE" : "ONE LITTLE STEP TO GO"; heading = <>A little code.<br /><em>{stage === "otp" ? "A fresh start." : "A warm welcome."}</em></>; description = "Enter the six-digit verification code for your phone number."; }
  else { eyebrow = "YOUR NEXT LITTLE FRESH START"; heading = <>A new password.<br /><em>A fresh start.</em></>; description = <>Choose a new password for your account.</>; }
  const notice = status || ((otp || stage === "reset-password") ? draft.notice || (otp ? unavailable.sms : "Phone verification must be connected before a password can be changed.") : "");
  return <div className="au-website"><Link className="skip-link" href="#auth-main">Skip to content</Link><header className="au-header"><Link href="/" className="au-brand" onClick={clearSecrets}><Image className="au-brand__logo" src="/images/mila-mirissa-logo-sm.png" alt="" width={96} height={96} aria-hidden="true" /><span className="au-brand__text">Mila Mirissa<small>KITCHEN &amp; GOOD COMPANY</small></span></Link><Link className="au-back" href="/" onClick={clearSecrets}><span aria-hidden="true">←</span> Back to restaurant</Link></header><main id="auth-main" className="au-layout"><aside className="au-atmosphere" aria-label="Restaurant atmosphere"><div className="au-image"><Image src="/images/restaurant.jpg" alt="Warm restaurant interior with olive banquettes and sunlit tables" width={1376} height={768} sizes="(max-width:767px) 1px,50vw" loading="eager" /><div className="au-photo-copy"><span className="au-eyebrow">A LITTLE PAUSE. A LOVELY MEAL.</span><h2>Good food.<br /><em>Good company.</em></h2><p>Your next little occasion starts<br />with a warm welcome.</p></div></div><div className="au-caption"><span>Good food. Made for good company.</span><em>Pull up a chair.</em></div></aside><section className="au-form-area" aria-labelledby="auth-heading">{stage !== "login" && <Steps stage={stage} />}<span className="au-eyebrow">{eyebrow}</span><h1 id="auth-heading">{heading}</h1><p className="au-intro">{description}</p>
    <form noValidate onSubmit={submit} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type !== "checkbox") { event.preventDefault(); event.currentTarget.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); } }}>
      {stage === "signup" && <div className="au-field"><label htmlFor="full-name">Your name</label><input id="full-name" name="name" autoComplete="name" value={draft.name} onChange={event => { updateAuthDraft({ name: event.target.value }); edit("full-name"); }} placeholder="What should we call you?" maxLength={80} aria-invalid={!!errors["full-name"]} aria-describedby={errors["full-name"] ? "name-error" : undefined} />{errors["full-name"] && <p className="au-error" id="name-error" role="alert">{errors["full-name"]}</p>}</div>}
      {["login", "signup", "forgot-password"].includes(stage) && phoneField(stage === "forgot-password" ? "Phone number on your account" : undefined)}
      {(stage === "login" || stage === "signup" || stage === "reset-password") && passwordFields(stage !== "login", stage === "reset-password")}
      {stage === "signup" && <><label className="au-terms"><input id="consent" type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); edit("consent"); }} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "consent-error" : undefined} /><span>I agree to the <button type="button" onClick={() => setLegal("terms")}>Terms</button> and <button type="button" onClick={() => setLegal("privacy")}>Privacy Notice</button>.</span></label>{errors.consent && <p className="au-error" id="consent-error" role="alert">{errors.consent}</p>}</>}
      {otp && <><div className="au-destination"><span>{masked}</span><Link href={route(stage === "otp" ? "forgot-password" : "signup")} onClick={clearSecrets}>Change number</Link></div><label id="code-label" className="au-code-label">Your verification code</label><div className="au-otp" role="group" aria-labelledby="code-label">{Array.from({ length: 6 }, (_, i) => <input key={i} ref={element => { inputs.current[i] = element; }} id={`otp-${i}`} type="text" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={i === 0 ? 6 : 1} aria-label={`Digit ${i + 1} of 6`} aria-invalid={!!errors["otp-0"]} aria-describedby={errors["otp-0"] ? "code-error" : undefined} onFocus={event => event.currentTarget.select()} onChange={event => { const digits = event.currentTarget.value.replace(/\D/g, "").slice(0, 6 - i); event.currentTarget.value = digits.charAt(0); if (digits.length > 1) digits.split("").forEach((digit, n) => { if (inputs.current[i + n]) inputs.current[i + n]!.value = digit; }); edit("otp-0"); if (digits) inputs.current[Math.min(i + digits.length, 5)]?.focus(); }} onPaste={event => { event.preventDefault(); const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6 - i); digits.split("").forEach((digit, n) => { if (inputs.current[i + n]) inputs.current[i + n]!.value = digit; }); edit("otp-0"); inputs.current[Math.min(i + digits.length, 5)]?.focus(); }} onKeyDown={event => { if (event.key === "Backspace" && !event.currentTarget.value && i > 0) { event.preventDefault(); inputs.current[i - 1]!.value = ""; inputs.current[i - 1]?.focus(); } if (event.key === "ArrowLeft" && i > 0) { event.preventDefault(); inputs.current[i - 1]?.focus(); } if (event.key === "ArrowRight" && i < 5) { event.preventDefault(); inputs.current[i + 1]?.focus(); } }} />)}</div>{errors["otp-0"] && <p className="au-error" id="code-error" role="alert">{errors["otp-0"]}</p>}</>}
      {action(stage === "login" ? "Log in" : stage === "signup" ? "Create account" : stage === "forgot-password" ? "Send reset code" : otp ? "Verify & continue" : "Reset password")}
    </form>
    {(stage === "login" || stage === "signup") && social}
    {otp && <div className="au-resend"><span>{seconds ? `Resend in 00:${String(seconds).padStart(2, "0")}` : "Didn’t get a code?"}</span><button type="button" disabled={seconds > 0} onClick={() => { setSeconds(30); setStatus(unavailable.sms); }}>Resend code</button></div>}
    {notice && <p className="au-status" role="alert">{notice}</p>}
    {stage === "login" && <p className="au-guest">Accounts aren’t connected yet. Enter any phone number and password to reach the reservation page — nothing is checked or saved. <Link href="/reserve">Skip to reservations</Link></p>}
    {stage === "login" ? switchLine("First time here?", "Create an account", "signup") : stage === "signup" ? switchLine("Already part of the table?", "Log in", "login") : switchLine("Ready to try again?", "Back to login", "login")}
  </section></main><footer className="au-footer"><span>Good food. Good company.</span><span className="au-powered">powered by microechef</span></footer><dialog ref={dialog} className="au-dialog" aria-labelledby="legal-title" onClose={() => setLegal(null)}><button type="button" className="au-close" aria-label="Close information" onClick={() => dialog.current?.close()}>×</button><h2 id="legal-title">{legal === "terms" ? "A thoughtful welcome." : "Your details, with care."}</h2><p>{legal === "terms" ? "Account registration and reservations are not connected yet. Final terms must be provided by the restaurant before account creation is enabled. No account or booking is created by these forms." : "These forms do not send data to a server or save it in cookies or local storage. Name and phone stay in this tab’s memory for navigation. Passwords are cleared when leaving their screen. No real login, SMS verification or Google account access is connected. The restaurant’s final privacy policy must be confirmed before launch."}</p><button type="button" className="au-primary" onClick={() => dialog.current?.close()}>Got it <Arrow /></button></dialog></div>;
}
