import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Our Story — Mila Mirissa",
  description:
    "Get to know the Mila Mirissa concept: the restaurant, the chef, hours, guest facilities and locations. Details are being confirmed.",
};
export default function OurStoryPage() {
  return <MicroEChef key="our-story" storyPage />;
}
