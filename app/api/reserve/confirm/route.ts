import { connection, NextResponse } from "next/server";
import { notifyTableBooking } from "@/lib/booking-notify";
import { createTableReservation, type ReservationInput } from "@/lib/table-reservation";

/**
 * POST /api/reserve/confirm — a table booking, written to dbo.Tbl_TabelReservation.
 * /api/order/confirm stays the only writer of the web order table.
 */
export async function POST(request: Request) {
  await connection();

  let body: Partial<ReservationInput> = {};
  try {
    body = (await request.json()) as Partial<ReservationInput>;
  } catch {
    return NextResponse.json({ ok: false, message: "The booking could not be read." }, { status: 400 });
  }

  const result = await createTableReservation({
    locCode: String(body.locCode ?? ""),
    tableNo: String(body.tableNo ?? ""),
    groupName: String(body.groupName ?? ""),
    date: String(body.date ?? ""),
    timeFrom: String(body.timeFrom ?? ""),
    timeTo: String(body.timeTo ?? ""),
    pax: Number(body.pax ?? 0),
    customerName: String(body.customerName ?? ""),
    customerPhone: String(body.customerPhone ?? ""),
    customerEmail: String(body.customerEmail ?? ""),
    note: String(body.note ?? ""),
  });

  if (!result.ok) {
    const { kind, message } = result.error;
    const status = kind === "invalid" ? 400 : kind === "taken" ? 409 : kind === "not-configured" ? 503 : 500;
    return NextResponse.json({ ok: false, reason: kind, message }, { status, headers: { "cache-control": "no-store" } });
  }

  // The booking is in the book. Now the text to the guest, the confirmation to
  // the guest's inbox, and the desk's copy to MGRemail — all after the commit,
  // and none of them able to undo it.
  const notified = await notifyTableBooking({
    resId: result.reservation.resId,
    tableNo: result.reservation.tableNo,
    area: body.groupName ? String(body.groupName) : "",
    date: result.reservation.date,
    from: result.reservation.timeFrom,
    to: result.reservation.timeTo,
    pax: Number(body.pax) || 0,
    name: String(body.customerName ?? ""),
    phone: String(body.customerPhone ?? ""),
    email: String(body.customerEmail ?? ""),
    note: String(body.note ?? ""),
  }).catch((error: unknown) => {
    console.error("[notify] table booking saved, notification failed:", error);
    return { sms: "failed" as const, guest: "failed" as const, manager: "failed" as const };
  });

  return NextResponse.json(
    { ok: true, ...result.reservation, notified },
    { headers: { "cache-control": "no-store" } },
  );
}
