import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Reservations — MicroEChef",
  description:
    "Reserve a table or a room at MicroEChef, or order from the kitchen for delivery or pickup.",
  robots: { index: false, follow: false },
};

export default function ReservePage() {
  return <MicroEChef key="reserve" reservePage />;
}
