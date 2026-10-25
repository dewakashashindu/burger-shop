# MicroEChef — Warm & Minimal, Sri Lankan Menu, Auth + Reservations/Order

## Current release — v10 / reservations and ordering

The approved **01 / Warm Menu** is integrated into the original **burger-shop** Next.js website as **`/menu`**. It is not a replacement project.

### What is included

- Cream/olive layout, arched feature photograph and responsive food-photo cards.
- **Sri Lankan dishes:** rice & curry, chicken kottu, egg hoppers, string hoppers, pol roti and watalappan.
- Four categories plus All dishes, category counts, live search, clear/reset and empty state.
- Click any dish card for details; Escape, focus trapping and return focus are supported.
- Featured rice & curry opens its details. Reservation buttons open the login screen.
- Header/mobile/footer navigation connects **Home ↔ Menu ↔ Our Story**.
- Home food callouts lead to the menu and relevant category. Home's signature/dessert photos are now chicken kottu and watalappan so the food direction stays consistent.
- The existing Home Story section, separate `/our-story` page, shared Warm Dining footer and exact small black **powered by microechef** credit are retained.
- All previously requested UI removals remain removed. Existing animations have **not** been removed or retimed.
- **Sign-in by text:** phone number → six-digit code (Text.lk) → signed in. No password, no Google, no forgot-password. A guest signs in **in a popup over the booking**, and a number that isn't in the book is sent to `/auth/signup` and brought straight back to the confirmation.
- **Sign-up proves the number:** details → a texted code → the account is written and the guest is already signed in. No account row exists until the code checks out, and the code is deleted the moment it is used.
- **The approved Warm Dining footer now appears on the reservation and order pages** too, with the exact small black *powered by microechef* credit. It stays off the auth screens.
- **Reservations & ordering (`/reserve`, `/order`):** after login (or the "Skip to reservations" link), a guest chooses **Reservation** (table or room) or **Order online**. Table booking is **one short form** (name, phone, date, time, **local guests and foreign guests counted separately**, seating preference, requests). Room booking has categories, stay packages, photo galleries, date range and NIC/passport. Ordering has the kitchen menu, animated add-to-cart, cart, delivery/pickup checkout.

## Run the website

Use Node.js **20.19+** or a supported Node 22+ release. Extract the ZIP and open the **burger-shop** directory containing `package.json`:

```bash
npm ci
npm run dev
```

Routes:

- `http://localhost:3000/` — Home
- `http://localhost:3000/menu` — Sri Lankan Warm Menu
- `http://localhost:3000/our-story` — separate animated Our Story page
- `http://localhost:3000/auth/login` — sign in with a phone number and a texted code
- `http://localhost:3000/auth/signup` — create an account (name, phone, address, optional email)
- `http://localhost:3000/reserve` — table/room reservations · `http://localhost:3000/order` — online order

For a production build:

```bash
npm run lint
npm run build
npm run start -- --hostname 0.0.0.0
```

On another device, use the server computer's **actual LAN IP**, not localhost or `0.0.0.0`. The existing LAN/HMR fix is unchanged: Next's dev origins include current IPv4 interfaces, the server hostname, loopback and the scoped Arena preview domain. For a different reverse-proxy hostname, set the exact hostname in `.env.local` and restart:

```text
DEV_ALLOWED_HOSTS=your-local-hostname
```

Do not add schemes, ports or paths. Hard-refresh after replacing an older project. Do not run the old outer folder if extracting created a nested burger-shop directory.

## Offline previews

The ZIP includes **six self-contained interactive HTML files**:

- **MicroEChef-Menu-Preview.html** — opens on the new menu.
- **MicroEChef-Preview.html** — opens on Home.
- **MicroEChef-Our-Story-Preview.html** — opens on Our Story.
- **MicroEChef-Auth-Preview.html** — opens on the clean Login screen.
- **MicroEChef-Reserve-Preview.html** — opens on reservations.
- **MicroEChef-Order-Preview.html** — opens on online ordering.

Every file contains all pages and supports switching between them without a server or network. Images, styles, scripts and the menu/Story font are embedded. Home uses a system sans-serif fallback if the original Open Sauce One provider is unavailable. The original Open Sauce One stylesheet links are retained in the actual Next.js layout.

These HTML files are generated snapshots, not the editable production source. For normal URLs, browser history and durable local draft storage, run the Next.js project. A sandboxed/opaque-origin file viewer may block local storage or downloads; no data is submitted in any version.

## Owner setup before launch

### Menu

Edit **`app/menu-data.ts`** for dish names, categories, descriptions and image paths. The six dishes are **illustrative content**, not a confirmed restaurant offering. No real prices were supplied, so the UI says **Price to confirm**. Confirm prices, portions, availability, recipes, allergens and dietary information before launch. Search intentionally covers dish name, short description and category; it is not an allergen filter.

Category links such as `/menu?category=Hoppers` select the matching category after JavaScript starts. Without JavaScript, the full six-dish menu remains readable, while filters and dialogs require JavaScript.

### Authentication

`AUTH.md` documents the sign-in in full. Accounts live in `dbo.Tbl_CustomerMaster`, codes in `dbo.Tbl_WebOtp` (hashed, 5 minutes, one use), and the customer number comes from the POS counter `dbo.Tbl_TxnNumbers` (`A000004` and on). SMS goes through Text.lk. `npm run otp:setup` creates the codes table. Without `TEXTLK_API_TOKEN` no text is sent — the code is written to the server log, and `WEB_AUTH_DEV=1` opens the in-memory book so the flow can be walked locally. Set `AUTH_SECRET` before launch.

### Restaurant details and reservations

Update the `RESTAURANT` object, Story placeholders and metadata with verified details. Address, hours, phone, email, head chef, facilities and other branches have not been supplied and are not invented.

Find your table / Book a table / Plan a visit actions now open `/auth/login`. The old browser-local booking draft component remains in source for future integration but is no longer reachable from public actions. No reservation is submitted and no table is reserved.

### Photography and fonts

All restaurant, chef and food photographs are **AI-generated concept/illustrative images**, not verified photographs of the actual venue, team or dishes. Visible AI-photo tags were removed as requested; the footer's Food photos information still explains this accurately. New menu images are in `public/images/`:

`rice-and-curry.jpg`, `chicken-kottu.jpg`, `egg-hoppers.jpg`, `string-hoppers.jpg`, `pol-roti.jpg`, `watalappan.jpg`.

Menu and Story use the embedded/local Inter variable font; the original Open Sauce One reference links remain in `app/layout.tsx`. The actual site may contact that external font provider; finalize its privacy policy accordingly.

## Source structure

```text
app/
  App.tsx                 shared shell, approved Home/Story, footer and dialogs
  menu-data.ts            Sri Lankan menu and category types
  menu/
    page.tsx              /menu route and metadata
    MenuContent.tsx       Warm Menu, filters, search and dish-detail content
  auth/
    AuthScreen.tsx        phone → code sign-in, and the create-account screen
    signin-dialog.css     the popup that stands over a booking at confirm
    */page.tsx            six /auth routes and noindex metadata
  our-story/page.tsx      separate /our-story route
  layout.tsx              shared CSS and original font-provider links
  globals.css             original site styling — unchanged in v8
  motion.css              original Home animation styles — unchanged in v8
  footer.css              approved Warm Dining — unchanged in v8
  story.css               approved cinematic Story — unchanged in v8
  story-motion.ts         original Story controller — unchanged in v8
  menu.css                new, scoped Warm Menu styles
  auth.css                new, scoped auth styles
public/
  images/                 optimized concept photographs
  fonts/                  local variable font
```

## Animation preservation and verification

The entire Home scroll-controller function block, all four existing CSS files, Story motion controller and LAN config were SHA256-checked against the pre-menu version and remain byte-identical. Home and Story geometry/reverse scroll/reveals/hover/footer pan/reduced-motion fallbacks passed regression tests. New menu CSS is scoped and does not redefine old motion.

The removed Pause ambience, Replay/Pause controls, Story notice, custom cursor and AI-photo figcaptions remain absent. OS reduced-motion preferences still work.

Current verification: lint and TypeScript/production build pass; menu tested at nine widths (320–1920px), Home and Story at eight viewport configurations each; auth tested at six routes × nine widths and in a scripts-only offline iframe at seven widths; filters/search/details, auth entry, mobile navigation, cross-page links, no-JavaScript/reduced-motion and network-blocked offline previews pass. See `VERIFICATION.json`, `AUTH.md`, `MENU.md`, `MOTION.md` and `STORY.md`.

Production dependency audit: **0 vulnerabilities**. The inherited development/lint dependency tree reports five high-severity findings; no forced breaking dependency upgrades were applied as part of this UI task.

Latest source archive: **burger-shop-MicroEChef-Reservations-Order.zip**. Generated dependency/build folders, Git metadata and temporary test screenshots are excluded.

## Live menu from SQL Server (read-only)

The `/menu` page asks `GET /api/menu/items` for the restaurant's live menu. When
the database is not configured (or cannot be reached) the page keeps the built-in
menu, so the site never shows an empty menu.

1. Copy `.env.example` to `.env.local` (or `.env`) and fill in the connection:

   ```
   DB_SERVER=192.168.1.20
   DB_PORT=1433
   DB_DATABASE=RestaurantDB
   DB_USER=readonly_user
   DB_PASSWORD=••••••
   DB_ENCRYPT=false
   DB_TRUST_SERVER_CERT=true
   ```

2. Restart the server (`npm run dev` or `npm run build && npm run start`).
3. Open `/menu` — the cards, categories and prices now come from the database.

**Source:** `dbo.Vw_MenuAssignment` (a) INNER JOIN `dbo.Tbl_MenuItems` (m), filtered by
`DisplayInFront = '1'`, `MenuAssiEnable = '1'`, `MenuItemEnable = '1'` and
`ISNULL(ItemNotAvailable, 0) = 0`.

**Field map**

| Screen | Column |
| :--- | :--- |
| dish name | `a.MenuItmDes` |
| price | `a.SalesPrice` |
| top tab | `a.Category` |
| group / tab fallback | `a.L1Des` |
| sub group (card eyebrow) | `a.L2Des` |
| description | `m.DisplayItemDes` |
| order | `a.L1LitingOrder`, `a.LISTINGORDER` |
| photo | `m.ItemPicMob` → `GET /api/menu/image/[code]` |
| out of stock | `ItemNotAvailable` |

Files: `lib/db.ts` (pool), `lib/menu-source.ts` (query + mapper),
`app/api/menu/items/route.ts`, `app/api/menu/image/[code]/route.ts`,
`app/menu/MenuContent.tsx` (live data on top of the server-rendered menu).

The database connection is **read-only** — the menu query only selects, and the
cart/order flow still runs entirely in the browser (nothing is written back).
