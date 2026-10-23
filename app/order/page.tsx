import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Order online — MicroEChef",
  description: "Order from the MicroEChef kitchen for delivery or pickup.",
  robots: { index: false, follow: false },
};

export default function OrderPage() {
  return <MicroEChef key="order" orderPage />;
}
