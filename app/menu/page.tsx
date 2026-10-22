import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Sri Lankan Menu — MicroEChef",
  description: "Explore Sri Lankan favourites: rice & curry, chicken kottu, egg hoppers, string hoppers, pol roti and watalappan. Prices and availability to be confirmed.",
};

export default function MenuPage() {
  return <MicroEChef key="menu" menuPage />;
}
