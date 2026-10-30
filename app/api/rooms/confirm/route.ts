import { connection, NextResponse } from "next/server";
import { notifyStayBooking } from "@/lib/booking-notify";
import { createRoomReservation, type RoomStayInput } from "@/lib/room-reservation";

/**
 * POST /api/rooms/confirm — a stay, written to dbo.Tbl_RoomReservation,
 * one row per room, under a number from dbo.Tbl_TxnNumbers (row RR).
 */
export async function POST(request: Request) {
  await connection();

  let body: Partial<RoomStayInput> = {};
  try {
    body = (await request.json()) as Partial<RoomStayInput>;
  } catch {
    return NextResponse.json({ ok: false, message: "The booking could not be read." }, { status: 400 });
  }

  const result = await createRoomReservation({
    locCode: String(body.locCode ?? ""),
    checkin: String(body.checkin ?? ""),
    checkout: String(body.checkout ?? ""),
    roomCodes: Array.isArray(body.roomCodes) ? body.roomCodes.map((code) => String(code)) : [],
    adults: Number(body.adults ?? 0),
    children: Number(body.children ?? 0),
    guestName: String(body.guestName ?? ""),
    guestPhone: String(body.guestPhone ?? ""),
    guestEmail: String(body.guestEmail ?? ""),
    guestIdNo: String(body.guestIdNo ?? ""),
    country: String(body.country ?? ""),
    packageCode: String(body.packageCode ?? ""),
    currency: body.currency === "USD" ? "USD" : "LKR",
    arrivalTime: String(body.arrivalTime ?? ""),
    departureTime: String(body.departureTime ?? ""),
    arrivalBy: String(body.arrivalBy ?? ""),
    requests: String(body.requests ?? ""),
    cusCode: String(body.cusCode ?? ""),
  });

  if (!result.ok) {
    const { kind, message } = result.error;
    const status = kind === "invalid" ? 400 : kind === "taken" ? 409 : kind === "not-configured" ? 503 : 500;
    return NextResponse.json({ ok: false, reason: kind, message }, { status, headers: { "cache-control": "no-store" } });
  }

  // Saved. Now the guest's text, the guest's email and the desk's copy — after
  // the commit, and never able to undo it.
  const notified = await notifyStayBooking({
    resId: result.reservation.resId,
    rooms: result.reservation.rooms.map((line) => ({ name: line.name })),
    checkin: result.reservation.checkin,
    checkout: result.reservation.checkout,
    nights: result.reservation.nights,
    adults: Number(body.adults) || 1,
    children: Number(body.children) || 0,
    arrival: String(body.arrivalTime ?? ""),
    departure: String(body.departureTime ?? ""),
    board: String(body.packageCode ?? ""),
    currency: result.reservation.currency,
    total: result.reservation.total,
    name: String(body.guestName ?? ""),
    phone: String(body.guestPhone ?? ""),
    email: String(body.guestEmail ?? ""),
    idNo: String(body.guestIdNo ?? ""),
    country: String(body.country ?? ""),
    requests: String(body.requests ?? ""),
  }).catch((error: unknown) => {
    console.error("[notify] stay saved, notification failed:", error);
    return { sms: "failed" as const, guest: "failed" as const, manager: "failed" as const };
  });

  return NextResponse.json(
    { ok: true, ...result.reservation, notified },
    { headers: { "cache-control": "no-store" } },
  );
}
