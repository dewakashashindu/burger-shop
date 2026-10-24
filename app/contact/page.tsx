import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Contact us — Mila Mirissa",
  description:
    "Message, email or call Mila Mirissa in Mirissa, Sri Lanka. WhatsApp 0771096131, email hello.milamirissa@gmail.com, or call 0772336233.",
};

export default function ContactPage() {
  return <MicroEChef key="contact" contactPage />;
}
