"use client";

import { useRouter } from "next/navigation";

/**
 * The small brown pill that follows the guest down the site.
 *
 * It only exists on the public pages (home, menu, our story): it is NOT drawn
 * inside the reservation/order flow or on the auth screens, because the guest
 * is already where it would take them.
 */
export default function OrderPill() {
  const router = useRouter();
  return (
    <button className="order-pill" type="button" onClick={() => router.push("/order")}>
      <span className="order-pill__dot" aria-hidden="true" />
      Order now
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
