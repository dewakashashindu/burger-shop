## Latest update — v6 / Separate animated Our Story page

The approved **03 / Place & Visit** design is now a real **`/our-story`** route, with the approved cinematic animations. The original main page and its Story section are retained. Navigation and the same Warm Dining footer connect both pages.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000/our-story` directly, or select **Our story** from the website navigation. For other devices, use your computer’s actual LAN IP; the existing automatic LAN/HMR fix is retained.

The ZIP contains two self-contained, interactive offline files: `MicroEChef-Preview.html` (starts on Home) and `MicroEChef-Our-Story-Preview.html` (starts on Story). Both can switch between the two pages. For normal URL routing and browser history, run the Next.js project.

The footer still has no giant wordmark and ends with small black **powered by microechef**. Restaurant/chef/hours/facilities/locations remain clearly labeled placeholders pending owner confirmation. Booking is still a local draft, not a reservation submission.

See **STORY.md** for page structure, animation behavior, owner setup and verification.

## Latest update — v5 / Warm Dining footer

- Implemented the selected Warm Dining footer inside the original `burger-shop` Next.js app.
- Removed the oversized footer wordmark. The bottom now reads **powered by microechef**, small (11–12px), black and centered.
- Preserved cream/olive styling, restaurant photograph, paper haze and bottom fog.
- Footer links connect to the existing scroll sections, menu, local reservation planner and visit dialog. Extra information links open accessible dialogs.
- Background is an AI-generated restaurant concept still with a subtle CSS pan, not video. Pause ambience and reduced-motion controls are supported.
- Responsive footer verified at 320, 360, 390, 767, 768, 1024, 1440 and 1920px.
- Existing arch/fullscreen/ivory/story motion and the v4 LAN-dev-origin fix are retained.
- `MicroEChef-Preview.html` is an offline interactive preview; the source ZIP is the deployable Next.js project. Booking remains a local draft, not a submission or confirmed reservation.

# burger-shop → MicroEChef

The **MicroEChef — Warm & Minimal (sample 04)** restaurant website is integrated directly into this `burger-shop` repository.

The repository's existing **Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4** stack is preserved. This is not a separate Vite app and does not contain a nested replacement project.

## LAN / dev-mode fix (v4)

If the page appeared but the animation did not start, and the Console repeatedly showed a WebSocket failure for `ws://192.168.1.100:3000/_next/hmr`, Next.js was blocking that LAN origin in development. In this version of Next, failed dev bootstrap can leave the server-rendered page visible without activating the scroll controller.

This failure was reproduced with an unlisted local network address: the page stayed as `arch-scroll` and the HMR WebSocket was rejected. After this fix, the same LAN URL successfully connects and activates `arch-scroll motion-ready`.

Changes:
- `next.config.ts` includes the computer's current IPv4 interface addresses and hostname in `allowedDevOrigins` automatically. No fixed Wi-Fi IP is required.
- `npm run dev` explicitly binds to `0.0.0.0` so other devices can reach the dev server.
- Loopback and Arena preview hosts remain supported. No unrestricted wildcard origin was added.

### Restart after updating

1. Stop the old dev server with **Ctrl+C**.
2. Extract this new ZIP into a fresh folder and open its **`burger-shop`** directory (the one containing `package.json`). Avoid running the old outer folder if a nested `burger-shop` folder was created by extraction.
3. Run `npm ci`, then `npm run dev`.
4. On the same computer, use the displayed localhost URL. On another device, use the server PC’s actual LAN IP and port, for example `http://192.168.1.100:3000`. `0.0.0.0` is a listening address, not a remote-device URL.
5. Hard refresh the browser (**Ctrl+Shift+R**) to discard the old dev client.

For Docker / reverse proxies where the browser hostname is not one of Node's local interface addresses, put the exact host in a local `.env.local` file and restart:

```text
DEV_ALLOWED_HOSTS=192.168.1.100
```

Use hostnames or IPs only, without `http://`, a port or a path. Multiple values can be comma-separated. Do not expose the development server to the public internet; use `npm run build` and `npm start` for deployment.

## Approved scroll animation (v3)

The approved **Arch → Full-screen → White/Cream fade → Complete kitchen reveal → Story arch** animation is now integrated into this repository. It is not just a sample anymore.

- One restaurant image smoothly expands to the viewport, fades under a near-white / ivory wash, and then lands in the actual story arch.
- The full burger + three food-card layout appears over the faded image, not a floating text box.
- Header and mobile navigation jump to the correct animation phase; Home / Kitchen / Story hash links still work.
- Real menu tabs, booking-draft actions and the story overlay buttons are retained.
- Scroll upward to reverse the transition.
- Reduced-motion / no-JavaScript browsers keep a readable normal-flow layout without pinning or blocking overlays.

See **`MOTION.md`** for the timeline, navigation stops and customization points.

## Loading-screen safety

The blocking 00% splash has been removed. Previously, the server HTML contained a full-screen loader and initially invisible sections; if browser hydration did not start, the loader could remain forever. The page now renders all three sections visibly on the server. The approved scroll sequence is progressive enhancement after JavaScript starts, not a requirement for seeing the content.

- JavaScript disabled / blocked: restaurant content and section links remain visible; dialogs and the planner still require JavaScript.
- Slow or unavailable scripts: no loading overlay hides the page.
- `MicroEChef-Preview.html`: a self-contained snapshot with the integrated scroll animation, app interactions, all five images and CSS embedded. Open this directly to preview without a server or external network. System font fallbacks are used. This snapshot is not auto-synced when editing the Next.js source.
- The canonical editable application is still this repository's `app/` directory; no separate Vite project was added.

Use a fresh extraction of this updated ZIP, stop the old server, and restart with the commands below. A hard refresh can clear an older page still open in the browser.

## Run කරන්න

Install Node.js **20.19+** or **22.12+**, then run inside `burger-shop`:

```bash
npm ci
npm run dev
```

Open **http://localhost:3000**.

ZIP එක extract කරලා `burger-shop` folder එක terminal / VS Code එකෙන් open කරන්න. ඉන්පස්සේ උඩ commands දෙක run කරන්න.

## Production

```bash
npm run lint
npm run build
npm start
```

Deploy as a **Next.js** app, for example on Vercel. For a Node host, run `npm ci`, `npm run build`, then `npm start`. This is not a Vite `dist/` project or a plain static HTML deployment.

The source ZIP excludes `node_modules`, `.next`, Git history and local credentials. Dependencies and build output are recreated by the commands above.

## Included

- Three restaurant sections: welcome, kitchen / food gallery, and story.
- Warm cream and olive palette, serif headings and arch-shaped photography.
- Fixed navigation, active section links, responsive mobile drawer and scroll locking.
- Immediate, visible server-rendered content, the approved arch-to-fullscreen / ivory-fade scroll journey, and a normal-flow reduced-motion fallback; no loading gate.
- Shared-image food mosaic using `ResizeObserver` and aligned masked cards.
- Four-category menu dialog.
- Reservation-request planner with validation, local draft saving, text download and draft clearing.
- Story and location / contact dialogs.
- Accessible dialog labels, focus trapping, Escape closing and focus restoration.
- Five AI-generated photographs stored locally in `public/images/`.
- Next.js `Image` for inline photographs and a custom SVG application icon.
- No external UI or icon libraries.

## Where to edit

```text
burger-shop/
├── app/
│   ├── page.tsx       # The homepage route renders MicroEChef
│   ├── App.tsx        # Client components, hooks, menu data, copy and interactions
│   ├── globals.css    # Tailwind 4 import and the normal-flow Warm & Minimal design
│   ├── motion.css     # Approved pinned arch / white-fade sequence
│   ├── layout.tsx     # Metadata, font links and root layout
│   └── icon.svg       # MicroEChef browser icon
├── public/
│   └── images/        # Five generated photographs
├── next.config.ts    # Existing Next setup + allowed preview origins
├── package.json      # Original Next.js / React dependency setup
└── package-lock.json
```

The original dependency versions and lockfile are preserved. Next's cache-components, partial-prefetching and Tailwind Turbopack integration remain enabled. Browser-only APIs are used in effects or browser snapshots, so the homepage can also be prerendered without hydration errors.

### Restaurant details

Edit `RESTAURANT` near the top of `app/App.tsx`:

```ts
const RESTAURANT = {
  name: 'MicroEChef',
  email: '',
  phone: '',
  address: '',
  hours: '',
};
```

No actual address, hours, phone or email were supplied, so the interface uses honest placeholders. Also update visible brand copy / logos in `App.tsx`, the sample `menu` data, and metadata in `layout.tsx` as necessary. The `name` property is not a global text-replacement mechanism.

### Menu and booking limitations

**The menu is illustrative and no real prices were supplied. Replace it with the approved menu before launch.** Allergen and dietary information must be confirmed with the restaurant.

**The booking planner does not send requests and does not reserve a table.** It saves a draft only in the visitor's local browser storage. It can download that draft as a text file, and it can clear the local personal details. No database, backend, payment system or delivery ordering flow is included.

Adding a real `email` value exposes an explicit `mailto:` option after a draft is saved. This opens the visitor's email application; it is not automatic delivery or a confirmed reservation. Connect a real booking service or a secured API for live reservations.

### Images and fonts

All five photographs are AI-generated concept imagery, **not verified photographs of the actual restaurant, its food or staff**:

- `restaurant.jpg` — sunlit cream / olive dining room.
- `table.jpg` — sharing table for the masked mosaic.
- `burger.jpg` — a brioche burger.
- `chef.jpg` — hands finishing a pasta dish.
- `dessert.jpg` — cheesecake and coffee.

Replace with actual photos where accurate representation is required. The original requested Open Sauce One stylesheet links are in `layout.tsx`, with system fallbacks if unavailable. Georgia serif headings preserve the selected Warm & Minimal sample. Confirm external font licensing / hosting permission before public launch.

## Verification

The updated Next.js repository was checked with:

- `npm run lint` — no errors or warnings.
- `npm run build` — production compilation, TypeScript and homepage prerendering pass.
- Chromium production checks at 360×667, 390×844, 767×900, 768×900, 1440×900, 1440×1000, 1568×700 and 1920×1080 with no horizontal overflow.
- Exact fullscreen geometry, ivory fade, all food cards, measured destination-arch alignment, reverse scrolling and deep links.
- Menu category switching, image loading, modal Escape handling and focus restoration.
- Reservation draft save, download and clearing.
- Mobile navigation and body scroll locking.
- Reduced-motion support, visible content with JavaScript disabled, and an offline sandbox preview.

No GitHub push has been performed; these changes are in the cloned local repository and the updated source ZIP.

### Dependency audit note

The repository's existing toolchain reports 5 high-severity advisories in development-only ESLint transitive packages at handoff. `npm audit --omit=dev` reports zero production dependency vulnerabilities. The suggested automated fix would downgrade the Next ESLint configuration, so a breaking forced change was not applied. Review build tooling updates and do not use the dev server as a production host.
