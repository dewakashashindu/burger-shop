# The landing hero — the clip, and the card laid over it

The landing page is now the hero drawn from the approved sketch: **the clip
fills the whole screen** (edge to edge, behind the header as well) and **the
words ride in a cream card laid over it** — top-left on a desktop, low on a
phone. Four rounded corners on the card.

It replaces the Triptych (three drifting panes). `app/triptych.css` and
`useTriptychScroll` are gone. The older arch / `motion-ready` styles in
`app/motion.css` were already inert and stay as history only.

## Sequence

1. **The picture.** One `hero.mp4` fills the hero (`object-fit: cover`,
   `object-position: 52% 55%`). The photograph underneath it is the same frame,
   so the first paint is never black while the clip downloads. Two soft veils —
   one at the top for the header, one at the floor — keep the type and the
   floating pills readable over any frame.
2. **The header.** While the hero is under it the navbar is transparent with a
   dark gradient and cream type (`.video-hero-page .navbar:not(.scrolled)`).
   Past 20 px it returns to the usual cream bar.
3. **The card.** 522 px wide on a desktop, from 88–104 px down the left edge to
   roughly two thirds of the screen — big enough for the headline at 63 px, the
   description, both actions and a meta row. On a phone it becomes a band 16 px
   from each edge, sitting 128 px above the floor so the floating pills never
   cover it.
4. **The floor of the hero.** *FRESH FOOD · WARM WELCOMES · SIMPLE JOYS ↓* links
   to the kitchen; **Sign in** and **Order now** float above it as usual.
5. **The hand-off.** Scrolling does three things, in this order:
   - the card fades and lifts away (`--vc-p` 0 → 1) and is `visibility: hidden`
     once it has gone, so its buttons cannot be clicked through;
   - the clip is left on its own, whole, with nothing on top of it — this is the
     sticky hero holding still while the next section carries a gap as its
     `margin-top`;
   - only then does the cream part of the page rise over it (`.vc-next`, opaque,
     rounded top corners, a soft shadow) and the hero stops with it.
   Scrolling back up reverses all three.
6. Below that the page is normal flow again: **Honest food. Happy moments.**
   with the signature card and mosaic tiles, then the story section, then the
   Warm Dining footer.

## Files

| File | What lives there |
| --- | --- |
| `app/App.tsx` | `useHeroCardFade(heroRef)` writes `--vc-p` from a rAF; the hero markup (`.vc-stage`, `.vc-hero`, `.vc-media`, `.vc-card`, `.vc-hint`); `video-hero-page` on the shell |
| `app/hero-video-card.css` | the hero grid, the card, the veils, the light header, `.vc-next` gap, phone + short-laptop blocks |
| `app/HeroClip.tsx` | plays the clip explicitly, retries on the first touch, pauses when the hero is off-screen |
| `app/motion-site.css` | the card and the words inside it arrive on load (`msFadeIn` + `msRise`) |

## Timing

| Signal | Where | Range |
| --- | --- | --- |
| `--vc-p` | `.vc-hero` inline style | 0 → 1 over **42 % of the viewport height** of scroll |
| card opacity / lift | `.vc-card` | `1 - --vc-p`, `translateY(-30px)`, `scale(0.985)` |
| card visibility | `.vc-cleared` | hidden once `--vc-p > 0.999` |
| the gap before the cream part | `.vc-next` | `clamp(70px, 46svh, 460px)` |
| on a phone | `.vc-next` | `16svh` |

## Fallbacks

- **Reduced motion** — `useHeroCardFade` writes nothing and the card never
  transforms, so the first screen is complete and still. The arrival animations
  are switched off in the same media block.
- **No JavaScript** — the server-rendered hero is the whole thing: clip, still,
  card, words and both buttons. The card simply stays where it is; the next
  section still follows it in normal flow.
- **The clip will not autoplay** — the photograph underneath is already there,
  so the hero is never empty.

## Delivery & caching

Prerendered pages used to answer with `Cache-Control: s-maxage=31536000`, so a
shared cache in front of the site could keep serving an older build long after a
new one shipped. `next.config.ts` now sends, for every document route:

```
Cache-Control: no-store, max-age=0, must-revalidate
Pragma: no-cache
X-Mila-Build: triptych-13
```

Rules that keep the fast path fast:

- `/_next/static/**` stays `public, max-age=31536000, immutable` (hashed names).
- `/images/**`, `/fonts/**` keep `public, max-age=0` and revalidate by ETag.
- `/hero.mp4` is cached for a day (`stale-while-revalidate=604800`), so the clip
  is downloaded once instead of once per visit.
- RSC prefetch payloads (`?_rsc=…`) are excluded from the no-store rule; they are
  already keyed by a build-specific hash and Chromium cancels them if forced to
  `no-store`.
