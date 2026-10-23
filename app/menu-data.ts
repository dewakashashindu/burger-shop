// Owner setup: illustrative Sri Lankan dishes, not a confirmed restaurant menu.
// Keep prices unknown until the restaurant provides its final menu.
export const MENU_CATEGORIES = [
  "Rice & curry",
  "Kottu & roti",
  "Hoppers",
  "Something sweet",
] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export type MenuFilter = string;
export type MenuDish = {
  id: string;
  name: string;
  /** A built-in category, or any category returned by the database. */
  category: MenuCategory | string;
  note: string;
  image: string;
  alt: string;
  description: string;
  detail: string;
  /** Only present when the dish came from the database. */
  price?: number;
  /** Readable top tab (F → Food, B → Beverage, O → Other). */
  categoryLabel?: string;
  /** Main group (L1Des) — used as the sub-category chips. */
  group?: string;
  subGroup?: string;
};
export function isMenuCategory(value: unknown): value is MenuCategory {
  return MENU_CATEGORIES.some((category) => category === value);
}
/** Any non-empty category slug, including ones the database adds later. */
export function isMenuFilter(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export const SRI_LANKAN_MENU: MenuDish[] = [
  {
    id: "rice-and-curry",
    name: "Rice & curry",
    category: "Rice & curry",
    note: "A plate of home",
    image: "/images/rice-and-curry.jpg",
    alt: "Illustrative Sri Lankan rice with chicken curry, dhal, vegetables and pol sambol",
    description:
      "Steamed rice, chicken curry, parippu, vegetable sides and a little pol sambol.",
    detail:
      "A plate of Sri Lankan comfort: rice at the centre, with chicken curry, lentil dhal, vegetable curries, greens and coconut sambol around it. The final selection of curries and accompaniments is to be confirmed.",
  },
  {
    id: "chicken-kottu",
    name: "Chicken kottu",
    category: "Kottu & roti",
    note: "The street-food favourite",
    image: "/images/chicken-kottu.jpg",
    alt: "Illustrative chicken kottu with chopped roti, vegetables and curry",
    description:
      "Chopped godamba roti, chicken, egg and vegetables, tossed with warming spices.",
    detail:
      "A take on the much-loved Sri Lankan street-food dish: chopped flatbread, chicken, egg, cabbage and carrots with a little curry. Ask the restaurant about the final recipe and available spice levels.",
  },
  {
    id: "egg-hoppers",
    name: "Egg hoppers",
    category: "Hoppers",
    note: "Crisp edges. Soft centre.",
    image: "/images/egg-hoppers.jpg",
    alt: "Illustrative bowl-shaped Sri Lankan hoppers with an egg in the centre",
    description:
      "Lacy rice-flour hoppers with a soft egg centre, served with lunu miris.",
    detail:
      "Bowl-shaped appa with delicate crisp edges and an egg nestled in the centre, paired here with onion-chilli lunu miris. Serving size, accompaniments and the final recipe are to be confirmed.",
  },
  {
    id: "string-hoppers",
    name: "String hoppers",
    category: "Hoppers",
    note: "A softer kind of comfort",
    image: "/images/string-hoppers.jpg",
    alt: "Illustrative rice-flour string hopper nests with kiri hodi and pol sambol",
    description:
      "Delicate steamed rice-flour nests, with kiri hodi and fresh pol sambol.",
    detail:
      "Idiyappam: fine steamed rice-flour strands shaped into little nests. Here they are paired with coconut-milk kiri hodi and coconut sambol. Please confirm portion size and current accompaniments with the restaurant.",
  },
  {
    id: "pol-roti",
    name: "Pol roti",
    category: "Kottu & roti",
    note: "Simple. Golden. Lovely.",
    image: "/images/pol-roti.jpg",
    alt: "Illustrative golden Sri Lankan coconut roti with red lunu miris",
    description:
      "Rustic coconut flatbreads, griddled until golden, with a little lunu miris.",
    detail:
      "A plate of thick coconut flatbreads with golden griddle marks and onion-chilli sambol on the side. The final flour blend, ingredients and accompaniments must be checked with the restaurant.",
  },
  {
    id: "watalappan",
    name: "Watalappan",
    category: "Something sweet",
    note: "A sweet little finish",
    image: "/images/watalappan.jpg",
    alt: "Illustrative dark jaggery and coconut watalappan custard topped with cashews",
    description:
      "Steamed coconut-and-jaggery custard, with cardamom and a few cashews.",
    detail:
      "The classic Sri Lankan steamed custard, made with coconut milk, jaggery, eggs and warm spices, with cashews pictured here. Ingredients, portion size and availability are to be confirmed.",
  },
];
