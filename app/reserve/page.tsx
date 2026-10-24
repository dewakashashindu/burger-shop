import { Suspense } from "react";
import type { Metadata } from "next";
import MicroEChef from "../App";

export const metadata: Metadata = {
  title: "Reservations — Mila Mirissa",
  description:
    "Reserve a table or a room at Mila Mirissa, or order from the kitchen for delivery or pickup.",
  robots: { index: false, follow: false },
};

async function ReserveBody({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <MicroEChef key="reserve" reservePage startView={view === "reserve" ? "reserve" : undefined} />;
}

export default function ReservePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  return (
    <Suspense fallback={<div className="reserve-page-shell" />}>
      <ReserveBody searchParams={searchParams} />
    </Suspense>
  );
}
