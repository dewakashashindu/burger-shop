export type Room = {
  id: string;
  cat: "rooms" | "suites" | "residences";
  name: string;
  img: string;
  size: string;
  sleeps: number;
  local: number;
  foreign: number;
  blurb: string;
  feature: string;
  gallery: string[];
};

export type Dish = {
  id: string;
  name: string;
  tag: string;
  img: string;
  price: number;
  desc: string;
  /** Top tab (F -> Food) when the row comes from the restaurant database. */
  category?: string;
  /** L1Des — the first sub-category card. */
  group?: string;
  /** L2Des — the second sub-category card. */
  sub?: string;
};

export const PHOTO = {
  restaurant: "/images/table-beach.jpg",
  bath: "/images/room-bath.jpg",
  breakfast: "/images/room-breakfast.jpg",
};

export const ROOMS: Room[] = [
  {
    id: "garden",
    cat: "rooms",
    name: "Garden Room",
    img: "/images/room-beach-garden.jpg",
    size: "32 m²",
    sleeps: 2,
    local: 24500,
    foreign: 95,
    blurb:
      "A calm room opening straight onto the garden, with a low linen bed and a wide shaded doorway.",
    feature: "Garden view",
    gallery: ["/images/room-beach-garden.jpg", PHOTO.bath, PHOTO.breakfast],
  },
  {
    id: "twin",
    cat: "rooms",
    name: "Twin Garden Room",
    img: "/images/room-twin.jpg",
    size: "34 m²",
    sleeps: 2,
    local: 26500,
    foreign: 105,
    blurb:
      "Two low teak beds, a quiet reading corner and the same green view through an arched window.",
    feature: "Garden window",
    gallery: ["/images/room-twin.jpg", PHOTO.bath, PHOTO.breakfast],
  },
  {
    id: "courtyard",
    cat: "suites",
    name: "Courtyard Suite",
    img: "/images/room-courtyard.jpg",
    size: "55 m²",
    sleeps: 3,
    local: 38500,
    foreign: 145,
    blurb:
      "A generous sitting room, an arched niche of ceramics and your own small courtyard.",
    feature: "Private courtyard",
    gallery: ["/images/room-courtyard.jpg", PHOTO.bath, "/images/room-twin.jpg"],
  },
  {
    id: "family",
    cat: "residences",
    name: "Family Residence",
    img: "/images/room-family.jpg",
    size: "80 m²",
    sleeps: 4,
    local: 52000,
    foreign: 195,
    blurb: "Two bedrooms and a long, light-filled living room for a slower stay together.",
    feature: "Two bedrooms",
    gallery: ["/images/room-family.jpg", "/images/room-twin.jpg", PHOTO.breakfast],
  },
];

export const CATS = [
  { id: "rooms", name: "Garden rooms", note: "For two, close to the garden", img: "/images/room-beach-garden.jpg" },
  { id: "suites", name: "Courtyard suites", note: "More room, your own courtyard", img: "/images/room-courtyard.jpg" },
  { id: "residences", name: "Family residences", note: "Space for the whole table", img: "/images/room-family.jpg" },
] as const;

export const PACKAGES = [
  { id: "breakfast", name: "Breakfast included", local: 0, foreign: 0 },
  { id: "half", name: "Half board", local: 3500, foreign: 12 },
  { id: "full", name: "Full board", local: 6500, foreign: 22 },
] as const;

export const DISHES: Dish[] = [
  {
    id: "rice",
    name: "Rice & curry",
    tag: "Rice & curry",
    img: "/images/rice-and-curry.jpg",
    price: 1450,
    desc: "Rice at the centre, with chicken curry, dhal, vegetable curries, greens and coconut sambol.",
  },
  {
    id: "kottu",
    name: "Chicken kottu",
    tag: "Kottu",
    img: "/images/chicken-kottu.jpg",
    price: 1250,
    desc: "Chopped flatbread with chicken, egg, cabbage and carrot, folded together on the griddle.",
  },
  {
    id: "egg",
    name: "Egg hoppers",
    tag: "Hoppers",
    img: "/images/egg-hoppers.jpg",
    price: 650,
    desc: "Lace-edged rice-flour hoppers with a soft egg at the centre and coconut sambol.",
  },
  {
    id: "string",
    name: "String hoppers",
    tag: "String hoppers",
    img: "/images/string-hoppers.jpg",
    price: 850,
    desc: "Steamed rice-flour nests with coconut-milk kiri hodi and sambol.",
  },
  {
    id: "roti",
    name: "Pol roti",
    tag: "Roti",
    img: "/images/pol-roti.jpg",
    price: 450,
    desc: "Thick coconut flatbreads with golden griddle marks and onion-chilli sambol.",
  },
  {
    id: "watalappan",
    name: "Watalappan",
    tag: "Sweet",
    img: "/images/watalappan.jpg",
    price: 650,
    desc: "Sri Lankan coconut custard with jaggery, egg and warm spice, finished with cashew.",
  },
];

export const money = (n: number, currency: "LKR" | "USD") =>
  currency === "USD"
    ? `USD ${Number(n).toLocaleString("en-US")}`
    : `LKR ${Number(n).toLocaleString("en-US")}`;
