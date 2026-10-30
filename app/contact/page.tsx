import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Contact us — Mila Mirissa",
  description:
    "Message, email or call Mila Mirissa in Mirissa, Sri Lanka. WhatsApp or call 0772336233, or email hello.milamirissa@gmail.com.",
};

export default function ContactPage() {
  return <MicroEChef key="contact" contactPage />;
}
