"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { refreshGuest, signOut, useGuest } from "./session";

/**
 * A quiet sign-in chip that stays in the bottom-right corner.
 *
 * It follows the guest around every page except the two auth screens (where
 * they are already signing in). On pages that also carry the "Order now" pill
 * it sits above it (`stacked`), so the corner reads
 * [ Sign in ] over [ Order now ]. No password anywhere — a code by text is the
 * whole of the sign-in.
 *
 * Once the tab has signed in it stops asking and simply shows who is here —
 * with one quiet way out: "Sign out" drops the httpOnly cookie on the server
 * and the mirror in this browser, in that order.
 */
export default function SignInFab({ stacked = false }: { stacked?: boolean }) {
  const guest = useGuest();
  const pathname = usePathname();

  // The cookie is the truth; the chip asks once on mount in case this tab
  // never saw the sign-in itself (a new tab, or a session that has lapsed).
  useEffect(() => {
    void refreshGuest();
  }, []);

  const next = encodeURIComponent(pathname || "/");

  if (guest) {
    return (
      <span className={`signin-fab is-in${stacked ? " is-stacked" : ""}`} title={`Signed in as ${guest.phone}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {guest.name ? guest.name.split(" ")[0] : "Signed in"}
        <button
          type="button"
          className="signin-fab__out"
          onClick={() => { void signOut(); }}
          aria-label={`Sign out${guest.name ? ` of ${guest.name}` : ""}`}
        >
          Sign out
        </button>
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
