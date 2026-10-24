import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Order online — Mila Mirissa",
  description: "Order from the Mila Mirissa kitchen for delivery or pickup.",
  robots: { index: false, follow: false },
};

export default function OrderPage() {
  return <MicroEChef key="order" orderPage />;
}
