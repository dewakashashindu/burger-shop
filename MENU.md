# Approved menu — 01 / Warm Menu

Integrated as `/menu` in the existing burger-shop project. The user selected Warm Menu, approved sample Sri Lankan dishes, and requested Sri Lankan dishes only rather than retaining the Western sample menu.

## Dishes and category counts

| Category | Sample dishes |
|---|---|
| Rice & curry | Rice & curry |
| Kottu & roti | Chicken kottu; pol roti |
| Hoppers | Egg hoppers; string hoppers |
| Something sweet | Watalappan |

All dishes: 6. Prices, recipes, portions and availability remain unconfirmed. No currency values or allergen-free claims are invented. Food photos are AI-generated illustrations.

## Interaction and integration

- Full-card dish targets, clear accessible names, detail dialogs, Escape and restored focus.
- Category button group with pressed state, live search/counts, clear, empty state and reset.
- Responsive three-column desktop cards; two-column tablet/mobile cards and horizontally scrollable mobile categories.
- Feature photo opens rice & curry. Booking actions use the existing local-draft planner, not a submission flow.
- Header/mobile/footer link to the real menu route; Home kitchen and sweetness callouts select relevant categories.
- Shared approved footer and small black `powered by microechef` credit unchanged.
- Full menu server-rendered and visible without JavaScript. Only a tiny nonvisual URL-category enhancement is suspended, so it cannot hide the food listing in a no-JS browser.
- Original font-provider links retained. Menu uses the local Inter variable font, embedded in offline previews.

## Files

`app/menu-data.ts`, `app/menu/MenuContent.tsx`, `app/menu/page.tsx`, `app/menu.css`, six new optimized images in `public/images/`. Shared shell/navigation/dialog integration is in `app/App.tsx` and the stylesheet import is in `app/layout.tsx`.

The Home signature and dessert photographs were changed to chicken kottu and watalappan without changing their dimensions, containers or animation code.

## Verification

- Lint and production build: pass.
- Menu widths: 1920, 1440, 1024, 900, 768, 767, 390, 360, 320px. No page/dialog horizontal overflow.
- Category counts, search, clear/reset/empty state, detail dialogs and focus return at every menu width: pass.
- Category deep link, full-menu reset via header, desktop/mobile Home/Menu/Story navigation and scroll unlock: pass.
- Booking request draft save/clear and truthful no-submission notice: pass.
- Removed controls remain absent; exact footer credit and truthful photo information retained.
- No-JavaScript and reduced-motion readable menu: pass.
- All three offline entry files regenerated; allow-scripts iframe with all network blocked, six menu widths, embedded photos/font, filters/details, category-targeted navigation and Story cinematic/Kitchen timeline: pass.
- Existing Home and Story regression suites: pass (eight viewport configurations each).
- All four pre-existing CSS files, Story controller, LAN config and full Home scroll-controller block: SHA256 unchanged.
