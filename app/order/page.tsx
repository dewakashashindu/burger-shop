import type { Metadata } from "next";
import MicroEChef from "../App";
import { getMenuSnapshot } from "@/lib/menu-cache";

export const metadata: Metadata = {
  title: "Order online — Mila Mirissa",
  description: "Order from the Mila Mirissa kitchen for delivery or pickup.",
  robots: { index: false, follow: false },
};

// Same reasoning as /menu: the order page must open on the real dishes, never
// on a placeholder that is then swapped underneath the guest's finger.
export const dynamic = "force-dynamic";

export default async function OrderPage() {
  const menu = await getMenuSnapshot();
  return <MicroEChef key="order" orderPage menu={menu} />;
}
