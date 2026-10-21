# Approved arch / white-fade motion

This is the integrated version of the approved **MicroEChef White Fade Preview 02**, not a separate prototype.

## Sequence

1. The restaurant image starts in the hero's right-hand arch (below the text on mobile).
2. Scrolling expands that same image to the exact viewport bounds, removing the corner radius.
3. An ivory wash fades over the image, leaving the restaurant faintly visible.
4. The complete **Honest food. Happy moments.** layout appears: signature burger card and three food-mosaic cards. The buttons open the real menu dialog.
5. More scrolling fades the food section out, removes the white wash, and shrinks the same image into the measured story arch.
6. The story, its interactive overlay cards, and the normal-flow footer follow.

Scrolling upward reverses the sequence. There are no prototype buttons, phase indicators, or loading overlays in the integrated website.

## Files

- `app/App.tsx`: `useArchScroll`, `navigateSection`, section content and all existing dialogs.
- `app/motion.css`: scoped progressive-enhancement styles for `.arch-scroll.motion-ready`.
- `app/globals.css`: the original normal-flow Warm & Minimal layout and modal styles.
- `app/layout.tsx`: loads global CSS first, motion CSS second.

## Timing

The scroll runway is `560svh` in `app/motion.css`. The sticky stage is one viewport high. Thus the animated scroll distance is about 4.6 viewport heights.

The following normalized progress values are in `useArchScroll`:

| Progress | Result |
| --- | --- |
| 0.000 | Hero arch |
| 0.035–0.340 | Expand to viewport |
| 0.350–0.450 | Ivory / white wash |
| 0.410–0.554 | Full food layout and staggered cards reveal |
| 0.560 | Kitchen navigation stop |
| 0.620–0.710 | Food layout fades away |
| 0.640–0.920 | Image shrinks into the measured destination |
| 0.690–0.890 | White wash clears |
| 0.720–0.880 | Story content appears |
| 0.980 | Story navigation stop |

The full-screen image is washed with `#f5f3eb` at up to `0.967` opacity. Adjust that value in the hook if the background should be stronger or weaker.

`SCROLL_STOPS` maps the Home / Kitchen / Story navigation links to the right timeline positions. Header, mobile-menu and footer links retain real hash anchors as a fallback. `#kitchen` / `#story` deep links are restored after hydration.

## Safety and accessibility

- Server-rendered content is visible and in normal document flow by default.
- No JavaScript: the three-section site is still readable; interactive dialogs need JavaScript.
- Reduced motion: the pinned sequence is skipped entirely and the normal-flow layout is used.
- Missing resize-observer support: normal flow is retained.
- In the enhanced sequence, inactive layers are `inert` / `aria-hidden`, so invisible buttons cannot steal focus.
- The frame geometry is remeasured on viewport / destination-size changes. The final frame is the actual story-photo bounding box, not an estimated fixed coordinate.
- Scroll updates use `requestAnimationFrame`; frame measurements are cached and refreshed on resize rather than read for every card on every scroll event.
- The controller does not intercept wheel or touch events; scrolling remains native.

The single-file `MicroEChef-Preview.html` also contains the integrated motion and app interactions, bundled images and CSS. It is an exported snapshot, not an automatically updated source file. Browser storage or downloads may be restricted when it is opened inside a sandboxed viewer; use the running Next.js app for the complete local booking-draft flow.
