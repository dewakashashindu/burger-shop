import type { Metadata } from "next";
import MicroEChef from "../App";
import { getMenuSnapshot } from "@/lib/menu-cache";

export const metadata: Metadata = {
  title: "Sri Lankan Menu — Mila Mirissa",
  description: "Explore the Mila Mirissa kitchen: the dishes and drinks the restaurant serves, with live prices.",
};

// Rendered per request, not baked at build time: a menu is a moving thing, and
// a build-time copy would go stale the moment the kitchen changes a price.
// The rows themselves are cached for a minute in lib/menu-cache.ts, so this
// costs one database read a minute — the HTML never carries a wrong dish.
export const dynamic = "force-dynamic";

export default async function MenuPage() {
  // Read before the first paint: the page opens on the real menu, so the
  // built-in illustrative dishes never flash in front of it.
  const menu = await getMenuSnapshot();
  return <MicroEChef key="menu" menuPage menu={menu} />;
}
