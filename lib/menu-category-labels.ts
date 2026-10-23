/**
 * The database stores the top tab as a short code — F, B, O — so the menu page
 * must not print those codes. Everything here maps a stored code to the words
 * the guest should read.
 *
 * Edit CATEGORY_LABELS if your POS uses different letters. You can also override
 * them without touching code, in .env:
 *
 *   MENU_CATEGORY_LABELS=F:Food,B:Beverage,O:Other
 */
export const CATEGORY_LABELS: Record<string, string> = {
  F: "Food",
  FOOD: "Food",
  B: "Beverage",
  BEV: "Beverage",
  BEVERAGE: "Beverage",
  O: "Other",
  OTH: "Other",
  OTHER: "Other",
  D: "Dessert",
  DES: "Dessert",
  DESSERT: "Dessert",
  S: "Snacks",
  SNACK: "Snacks",
  M: "Main courses",
  MAIN: "Main courses",
  ST: "Starters",
  STARTER: "Starters",
  SD: "Side dishes",
  SIDE: "Side dishes",
  K: "Kids",
  KIDS: "Kids",
  SP: "Specials",
  SPECIAL: "Specials",
  SPECIALS: "Specials",
};

/** .env override, parsed once per request. */
function envLabels(): Record<string, string> {
  const raw = process.env.MENU_CATEGORY_LABELS?.trim();
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const at = pair.indexOf(":");
    if (at < 0) continue;
    const key = pair.slice(0, at).trim().toUpperCase();
    const value = pair.slice(at + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/(^|[\s/&-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());

/**
 * F -> Food · B -> Beverage · O -> Other.
 * A value that already looks like a name ("Rice & curry", "Hot drinks") is kept.
 * An unknown short code is title-cased so it never appears as a bare letter.
 */
export function categoryLabel(code: string | null | undefined): string {
  const raw = (code ?? "").trim();
  if (!raw) return "From our kitchen";

  const overrides = envLabels();
  const key = raw.toUpperCase();
  if (overrides[key]) return overrides[key];
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];

  // Already a readable name: more than three characters, or more than one word.
  if (raw.length > 3 || /\s/.test(raw)) return raw;

  return titleCase(raw);
}
