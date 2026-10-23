import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Our Story — MicroEChef",
  description:
    "Get to know the MicroEChef concept: the restaurant, the chef, hours, guest facilities and locations. Details are being confirmed.",
};
export default function OurStoryPage() {
  return <MicroEChef key="our-story" storyPage />;
}
