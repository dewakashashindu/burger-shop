# MicroEChef — Warm & Minimal + Sri Lankan Warm Menu

## Current release — v8 / Sri Lankan menu

The approved **01 / Warm Menu** is integrated into the original **burger-shop** Next.js website as **`/menu`**. It is not a replacement project.

### What is included

- Cream/olive layout, arched feature photograph and responsive food-photo cards.
- **Sri Lankan sample dishes only:** rice & curry, chicken kottu, egg hoppers, string hoppers, pol roti and watalappan.
- Four categories plus All dishes, category counts, live search, clear/reset and empty state.
- Click any dish card for details; Escape, focus trapping and return focus are supported.
- Featured rice & curry opens its details. Reservation buttons open the existing local request planner.
- Header/mobile/footer navigation connects **Home ↔ Menu ↔ Our Story**.
- Home food callouts lead to the menu and relevant category. Home's signature/dessert photos are now chicken kottu and watalappan so the food direction stays consistent.
- The existing Home Story section, separate `/our-story` page, shared Warm Dining footer and exact small black **powered by microechef** credit are retained.
- All previously requested UI removals remain removed. Existing animations have **not** been removed or retimed.

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

The ZIP includes **three self-contained interactive HTML files**:

- **MicroEChef-Menu-Preview.html** — opens on the new menu.
- **MicroEChef-Preview.html** — opens on Home.
- **MicroEChef-Our-Story-Preview.html** — opens on Our Story.

Every file contains all three pages and supports switching between them without a server or network. Images, styles, scripts and the menu/Story font are embedded. Home uses a system sans-serif fallback if the original Open Sauce One provider is unavailable. The original Open Sauce One stylesheet links are retained in the actual Next.js layout.

These HTML files are generated snapshots, not the editable production source. For normal URLs, browser history and durable local draft storage, run the Next.js project. A sandboxed/opaque-origin file viewer may block local storage or downloads; no data is submitted in any version.

## Owner setup before launch

### Menu

Edit **`app/menu-data.ts`** for dish names, categories, descriptions and image paths. The six dishes are **sample content**, not a confirmed restaurant offering. No real prices were supplied, so the UI says **Price to confirm**. Confirm prices, portions, availability, recipes, allergens and dietary information before launch. Search intentionally covers dish name, short description and category; it is not an allergen filter.

Category links such as `/menu?category=Hoppers` select the matching category after JavaScript starts. Without JavaScript, the full six-dish menu remains readable, while filters and dialogs require JavaScript.

### Restaurant details and reservations

Update the `RESTAURANT` object, Story placeholders and metadata with verified details. Address, hours, phone, email, head chef, facilities and other branches have not been supplied and are not invented.

The reservation planner is **a browser-local draft only**, not a reservation service. Nothing is sent; no table is reserved. It can save, download and clear a request. The storage key is `microechef-booking-draft`; the Clear draft & personal details action removes it. Avoid sensitive notes. Connect a real booking service and confirm privacy/consent requirements before launch.

### Photography and fonts

All restaurant, chef and food photographs are **AI-generated concept/illustrative images**, not verified photographs of the actual venue, team or dishes. Visible AI-photo tags were removed as requested; the footer's Food photos information still explains this accurately. New menu images are in `public/images/`:

`rice-and-curry.jpg`, `chicken-kottu.jpg`, `egg-hoppers.jpg`, `string-hoppers.jpg`, `pol-roti.jpg`, `watalappan.jpg`.

Menu and Story use the embedded/local Inter variable font; the original Open Sauce One reference links remain in `app/layout.tsx`. The actual site may contact that external font provider; finalize its privacy policy accordingly.

## Source structure

```text
app/
  App.tsx                 shared shell, approved Home/Story, footer and dialogs
  menu-data.ts            Sri Lankan sample menu and category types
  menu/
    page.tsx              /menu route and metadata
    MenuContent.tsx       Warm Menu, filters, search and dish-detail content
  our-story/page.tsx      separate /our-story route
  layout.tsx              shared CSS and original font-provider links
  globals.css             original site styling — unchanged in v8
  motion.css              original Home animation styles — unchanged in v8
  footer.css              approved Warm Dining — unchanged in v8
  story.css               approved cinematic Story — unchanged in v8
  story-motion.ts         original Story controller — unchanged in v8
  menu.css                new, scoped Warm Menu styles
public/
  images/                 optimized concept photographs
  fonts/                  local variable font
```

## Animation preservation and verification

The entire Home scroll-controller function block, all four existing CSS files, Story motion controller and LAN config were SHA256-checked against the pre-menu version and remain byte-identical. Home and Story geometry/reverse scroll/reveals/hover/footer pan/reduced-motion fallbacks passed regression tests. New menu CSS is scoped and does not redefine old motion.

The removed Pause ambience, Replay/Pause controls, Story notice, custom cursor and AI-photo figcaptions remain absent. OS reduced-motion preferences still work.

Current verification: lint and TypeScript/production build pass; menu tested at nine widths (320–1920px), Home and Story at eight viewport configurations each; filters/search/details, booking draft, mobile navigation, cross-page links, no-JavaScript/reduced-motion and network-blocked offline previews pass. See `VERIFICATION.json`, `MENU.md`, `MOTION.md` and `STORY.md`.

Production dependency audit: **0 vulnerabilities**. The inherited development/lint dependency tree reports five high-severity findings; no forced breaking dependency upgrades were applied as part of this UI task.

Latest source archive: **burger-shop-MicroEChef-Sri-Lankan-Menu.zip**. Generated dependency/build folders, Git metadata and temporary test screenshots are excluded.
