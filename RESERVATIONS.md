# Reservations & online order — integrated

## What the guest sees

`/auth/login` → **Continue as a guest** → `/reserve`

The guest chooses **Reservation** (table or room) or **Order online**.

### Table reservation — one short form
Full name, phone number, date, time, **local guests** and **foreign guests counted separately**, seating preference and special requests. The total guest count updates live as you type. Numbers are free-form (no 8-guest ceiling). Confirm reservation → confirmation screen.

There are deliberately **no** food add-ons, packages, floor-plan or table picking, price calculation or multi-step wizard on the table booking.

### Room reservation
Categories (garden rooms / courtyard suites / family residences) → stay packages with LKR and USD rates → room list → room page with photo gallery → booking form with a **date range** (check-in/check-out), guests, package, name, phone, **NIC or passport** and requests → live total → confirmation.

### Online order
Kitchen menu → **Add** (the dish photo flies into the cart badge) → cart with quantity changes and removal → delivery or pickup → name, phone, address and notes → confirmation.

## Routes
`/reserve`, `/order`, and the six `/auth/*` screens. All are static UI routes marked `noindex`.

## Scope — not connected
**No account, reservation, room booking, order or payment is sent anywhere.** There is no backend, database, SMS, Google OAuth, session or payment provider. Every confirmation screen says the details stay in the browser tab. Confirmation references are generated locally and are not real.

Rates, packages, delivery fee, room names, menu prices and times are **illustrative placeholders** for the layout and must be replaced with confirmed business data. Room photographs are AI-generated concept images, not verified photography of the property.

The old local booking-draft component remains unreferenced in `app/App.tsx`; public booking actions no longer open it.

## Files
- `app/reserve/BookingFlow.tsx` — the whole reservation/order UI
- `app/reserve/booking-data.ts` — rooms, packages, dishes and price helpers
- `app/reserve.css` — fully scoped to `.reserve-page-shell`; no selector escapes into the rest of the site
- `app/reserve/page.tsx`, `app/order/page.tsx` — routes
- `public/images/room-*.jpg` — six generated room/atmosphere photographs
- `app/App.tsx` — adds the two routes and the booking CTA stays on `/auth/login`
- `app/auth/AuthScreen.tsx` — adds the "Continue as a guest" link on login

## Verification
Lint and production build pass. Tested at 1920, 1440, 1024, 900, 768, 767, 390, 360 and 320 px with no horizontal overflow, plus the full table/room/order flows, guest-count validation, reduced motion, no-JavaScript content, zero POST requests and zero page errors. Home, Story and Menu regressions still pass; all four protected CSS files, the Story controller and the Home animation controller remain byte-identical.

See `../microechef-testing/reserve-site-results.json`.
