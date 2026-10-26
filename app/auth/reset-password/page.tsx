import type { Metadata } from "next";
import { redirect } from "next/navigation";

/**
 * Retired route.
 *
 * Sign-in is a phone number plus a six-digit text message — there is no
 * password to forget, reset or separately verify, so these four old screens
 * have no step of their own. Old links land on the one screen that does
 * the whole job.
 */
export const metadata: Metadata = {
  title: "Reset password — Mila Mirissa",
  robots: { index: false, follow: false },
};

export default function Page() {
  redirect("/auth/login");
}
