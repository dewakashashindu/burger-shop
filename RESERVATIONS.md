# Reservations & online order — integrated

## What the guest sees

`/reserve` opens straight away — no sign-in gate, no door to walk through.

The guest chooses **Reservation** (table or room) or **Order online**.

### Table reservation — one short form
**Phone number first, then the name.** The number is the key: a guest who has
already signed in on this browser gets their name filled in by itself, and on the
order form their saved addresses appear as one-tap picks. A number that has an
account but has not been proved here shows a single line — *"This number has an
account — sign in once and your name comes with it"* — with a **Bring my details**
button that opens the sign-in popup in place.

Then date, a **time period** (start and end), dining area and table
from the restaurant's own floor plan, **local guests** and **foreign guests counted
separately**, and special requests. The total guest count updates live as you type.
Numbers are free-form (no 8-guest ceiling). Confirm reservation → sign-in popup (if the
guest is not signed in) → confirmation screen with the `TR-0001` reference.

There are deliberately **no** food add-ons, packages, price calculation or multi-step
wizard on the table booking.

### Room reservation
Categories (garden rooms / courtyard suites / family residences) → stay packages with LKR and USD rates → room list → room page with photo gallery → booking form with a **date range** (check-in/check-out), guests, package, name, phone, **NIC or passport** and requests → live total → confirmation.

### Online order
Kitchen menu → **Add** (the dish photo flies into the cart badge) → cart with quantity changes and removal → delivery or pickup → name, phone, address and notes → confirmation.

## Routes
`/reserve`, `/order`, and the two `/auth/*` screens (login, signup). The auth routes are marked `noindex`.

## Scope — what is connected
- **Reservations** are written to `dbo.Tbl_TabelReservation`.
- **Orders** are written to `dbo.Tbl_holdUpsCloudTempOO`, one bill per invoice number
  (`INV-YYYYMMDD-NNN`, Sri Lankan day, `RowLine = MAX + 1` under `TABLOCKX, HOLDLOCK`).
- **Accounts** live in `dbo.Tbl_CustomerMaster`; the customer code comes from
  `dbo.Tbl_TxnNumbers` (`A000004`…); sign-in codes live in `dbo.Tbl_WebOtp` and are
  sent by Text.lk. See `AUTH.md`.
- Confirming a table, a room or an order asks a guest who is not signed in to sign
  in **in a popup over the page**; the booking waits and then confirms itself.
- **No payment** is taken on the site.

Rates, packages, delivery fee, room names and times are **placeholders** for the layout
and must be replaced with confirmed business data. Room photographs are illustrative
concept images, not verified photography of the property.

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
