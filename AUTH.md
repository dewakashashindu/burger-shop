# Clean authentication UI — integrated

## Approved changes

- Phone number + password login.
- Signup with name, phone, password and password confirmation.
- Forgot password → OTP screen → new password screen.
- Google button **after** phone/password fields and primary form action, on Login and Signup.
- Google button uses cream/light olive, olive text and border; no blue button background. The official multicolour G is retained.
- No Account help screen, sample/demo labels, fixed-code helper, screen-selector toolbar or reset-preview control in the website UI.
- Find your table / Book a table / Plan a visit actions now open `/auth/login` from Home, Menu, Story, mobile navigation and footer.
- Existing Home/Story animation calculations, timing/styles and shared footer remain unchanged.

## Routes

- `/auth/login`
- `/auth/signup`
- `/auth/forgot-password`
- `/auth/otp` — reset-code UI
- `/auth/verify-phone` — signup-code UI
- `/auth/reset-password`

These are static UI routes, not protected account routes. Auth pages are marked noindex. No real booking or account is created.

## Important implementation scope

**Authentication services are not connected.** There is no credential check, password storage/hash, account database, SMS provider, OTP verifier, reset-token issuer, Google OAuth integration or session creation.

Login and Google actions display an accurate not-connected status. Signup and forgot-password actions navigate to the OTP UI with a message that **no code has been sent**. Six-digit format input can navigate from the reset OTP screen to the password screen, while explicitly stating that the code **has not been verified**. This is only a UI transition, not proof of identity or authorization. The password form never changes a password; it reports the service is not connected. Signup verification does not create an account.

There is **no fixed OTP** or fake success session. Never use these client-side routes, flags, formatting checks or timers as security controls. Production requires server-side verification, expiring/single-use reset authorization bound to the account, rate limiting, safe error handling/account-enumeration protection, secure hashing, sessions, configured Google OAuth and final legal/privacy policies.

Do not enter real credentials until the backend is implemented. The UI sends no form POST or credential request. Phone/name are held only in a tab-memory store for navigation, not cookies/local storage. Password values are uncontrolled DOM values, not copied into the draft; they are cleared on navigation and after unavailable-service submissions.

The old local booking-draft component remains in source for future integration but is no longer reachable from public booking actions. No authenticated booking handoff is simulated.

## Files

`app/auth/AuthScreen.tsx`, `app/auth/auth-draft.ts`, six route files, `app/auth.css`. Shared booking CTA routing is centralized in `app/App.tsx`; `app/layout.tsx` imports the scoped stylesheet.

`MicroEChef-Auth-Preview.html` starts on Login and embeds the whole website with offline internal navigation, matching the other three updated HTML snapshots. It has no visible preview controls/labels.

## Verification

Lint and production build pass. Six auth routes tested at nine widths (320–1920px), Google order and olive colour, removed labels, validation/toggles/matching passwords, Home/Menu/Story/mobile entry points, legal dialog, unavailable-service statuses, scroll unlock, no-JavaScript/reduced-motion and zero form POSTs. Scripts-only opaque iframe with all network blocked passes seven widths, form actions and all-page navigation.

All four existing CSS files, Story controller, LAN config and full Home scroll-controller block are SHA256 unchanged. Eight-viewport Home/Story regressions and nine-width menu tests pass. Temporary screenshots are removed after visual review.
