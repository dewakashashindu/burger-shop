# Our Story — approved Place & Visit / cinematic implementation

## Routes and navigation

- `/` keeps the original restaurant landing page, including its existing Our Story section and approved arch → fullscreen → ivory food layout → story arch motion.
- `/our-story` is the new, separate Story page. It has its own page title and description.
- Main/mobile navigation and the shared footer’s **Our story** link open the new route.
- The original main-page Story dialog also links to **Explore our full story**. The dialog closes before navigation, so returning home does not reopen a cached dialog or lock scrolling.
- The separate page’s Home and Kitchen links return to `/` and `/#kitchen`. The kitchen deep link uses the original measured scroll timeline.
- Home, Menu and Story render the very same Warm Dining footer JSX. Its oversized wordmark remains removed; the small, centered, black credit reads exactly **powered by microechef**.

## Approved motion

1. Cinematic image opening and masked heading entrance.
2. Native-scroll pinned restaurant photograph expands to full bleed.
3. Central atmospheric text, followed by a cream paper wipe and closing phrase.
4. Reading-progress word emphasis and staggered section headings.
5. Opening-hours divider reveals and staggered facility icons.
6. Chef portrait arch reveal, gentle photograph parallax and scroll-driven circular care seal.
7. Fine-pointer card tilt, magnetic call-to-action hover.
8. Shared-footer content reveal; existing subtle ambient photo pan is preserved.

Replay/Pause controls, the footer ambience control, the top confirmation notice, custom cursor overlay and photo-caption tags were removed in v7 at the user’s request. Animations still start and run automatically; their timing, interpolation and styling are unchanged. Scrolling is native: no wheel interception, artificial scroll engine, video, WebGL or external animation/icon libraries.

## Implementation

- `app/App.tsx`: all React UI components, shared shell/footer/dialogs, existing home page and new Story content.
- `app/our-story/page.tsx`: Next.js route and metadata.
- `app/story-motion.ts`: typed, scoped motion controller. Uses requestAnimationFrame, IntersectionObserver and direct CSS-property updates rather than scroll-driven React rendering.
- `app/story.css`: route-scoped page and animation styling. No Story selectors affect the home page.
- `public/images/chef-portrait.jpg`: illustrative AI-generated portrait, **not the real chef**.
- `public/fonts/inter-variable.woff2`: local Story font; no CDN is needed for this page’s Inter font. The existing Open Sauce links are retained in the shared layout.

The controller disconnects observers, cancels timers/frames, removes event handlers, and releases inert states during route/Strict Mode cleanup. It supports Next’s inactive-page caching without duplicate active controllers. No custom cursor is created.

## Fallbacks and accessibility

- Reduced-motion preference: readable, unpinned page, no cinematic animation or ambient photo pan.
- JavaScript disabled or missing IntersectionObserver: visible, normal-flow content, not a blank loading gate.
- Standard keyboard navigation and visible focus indicators.
- Existing accessible dialogs retain Escape, focus trapping/restoration and body scroll-lock cleanup.
- Reservation planner remains a **local draft only**. No request is submitted and no table is reserved.

## Owner information still required

The user approved sample/placeholder content for previews; it is intentionally still labeled as unconfirmed.

Before publishing:

- Approve the restaurant introduction and actual history.
- Supply the head chef’s real name, role, biography and photo. Replace the illustrative portrait.
- Set confirmed weekday/weekend/holiday opening hours. Update both the Story schedule and `RESTAURANT.hours` used by Visit us.
- Confirm every facility, including parking, Wi-Fi, group arrangements, accessibility and dietary accommodations. Do not change these to availability claims without confirmation.
- Set the real address, email and phone in `RESTAURANT` in `App.tsx`.
- Add only verified other branches, or remove the optional Other locations card.
- Replace concept images with genuine venue/dish photography as appropriate.
- Finalize menu, allergens, booking integration and privacy information before launch.

## Offline previews

- `MicroEChef-Preview.html` starts on the main page.
- `MicroEChef-Our-Story-Preview.html` starts on the Story page.
- `MicroEChef-Menu-Preview.html` starts on the Sri Lankan Warm Menu.

All three self-contained files embed photographs, menu/Story fonts, styles and scripts and can switch between all three pages without a network connection. They demonstrate the actual React UI/motion, not the earlier standalone sample. Normal browser URL routing/back navigation is provided by the Next.js website; the offline snapshots use local in-file navigation.

## Verification

Production: lint, TypeScript/prerender/build, zero production audit findings, nine Story viewport sizes (320–1920px), original eight-viewport home-motion regression, menu/draft/visit/info dialogs, cross-route navigation and cleanup, reduced-motion/no-JS/unsupported-API fallbacks.

Previous development verification: `npm run dev` at localhost, loopback and the sandbox’s LAN IPv4 address; both motion controllers initialize, one scoped Story controller is active, and no HMR WebSocket or hydration errors occur. The automatic local-IP allowedDevOrigins fix is unchanged.

Offline sandbox: `allow-scripts`, no network; embedded fonts/photos, full-bleed cinematic scene, chef/menu dialogs, page switching, exact Kitchen timeline landing and mobile layout pass.

## v7 cleanup verification

- All requested controls, Story notice, custom cursor and photo-caption tags are absent from the rendered page and offline preview.
- All four CSS files (`globals.css`, `motion.css`, `footer.css`, `story.css`) and `next.config.ts` are byte-identical to v6.
- The full Story scroll-calculation block is unchanged verbatim.
- Cinematic full bleed, paper wipe, chef reveal, card hover and automatic footer photo pan pass at 8 viewport sizes (320–1920px).
- Original eight-viewport home-motion regression, page navigation, menu/chef dialogs, reduced-motion and no-JS fallbacks pass.
- Offline sandbox with no network passes Story/Home navigation, embedded assets and cinematic motion.

## v8 Sri Lankan menu integration

Header/mobile/footer menu links now open `/menu`, the approved Warm Menu with six Sri Lankan sample dishes and dish-detail dialogs. Story content, timing and animation styles/controller are unchanged (SHA256 verified). Current eight-width Story and Home regression tests, plus network-blocked three-page offline navigation, pass. See `MENU.md`.
