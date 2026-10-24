"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGuest } from "./session";

/**
 * A quiet sign-in chip that stays in the bottom-right corner.
 *
 * It follows the guest around every page except the six auth screens (where
 * they are already signing in). On pages that also carry the "Order now" pill
 * it sits above it (`stacked`), so the corner reads
 * [ Sign in ] over [ Order now ].
 *
 * Once the tab has signed in it stops asking and simply shows who is here.
 */
export default function SignInFab({ stacked = false }: { stacked?: boolean }) {
  const guest = useGuest();
  const pathname = usePathname();
  const next = encodeURIComponent(pathname || "/");

  if (guest) {
    return (
      <span className={`signin-fab is-in${stacked ? " is-stacked" : ""}`} title={`Signed in as ${guest.phone}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {guest.name ? guest.name.split(" ")[0] : "Signed in"}
      </span>
    );
  }

  return (
    <Link className={`signin-fab${stacked ? " is-stacked" : ""}`} href={`/auth/login?next=${next}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8.4" r="3.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Sign in
    </Link>
  );
}
