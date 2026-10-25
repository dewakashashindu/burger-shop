import { connection, NextResponse } from "next/server";
import { readWebOrderInput, saveWebOrder } from "@/lib/web-order";

/**
 * POST /api/order/confirm
 * The only write endpoint on this website: cart → dbo.Tbl_holdUpsCloudTempOO.
 *
 * Prices, availability, the invoice number and the order numbers all come from
 * the database — the browser only says which dishes and how many.
 */
export async function POST(request: Request) {
  await connection();

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid", message: "The order could not be read." }, { status: 400 });
  }

  const input = readWebOrderInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ ok: false, reason: "invalid", message: input }, { status: 400 });
  }

  const saved = await saveWebOrder(input);
  if (!saved.ok) {
    const { kind, message } = saved.error;
    const status = kind === "invalid" ? 400 : kind === "items-changed" ? 409 : kind === "not-configured" || kind === "table-missing" ? 503 : 500;
    console.error(`[order] not saved (${kind}): ${message}`);
    return NextResponse.json(
      { ok: false, reason: kind, message, changed: "changed" in saved.error ? saved.error.changed : undefined },
      { status, headers: { "cache-control": "no-store" } },
    );
  }

  console.info(
    `[order] saved ${saved.result.tabelNo} · order ${saved.result.orderNo} · ${saved.result.lines} line(s) · ${saved.result.invoiceNo}`,
  );
  return NextResponse.json(
    { ok: true, ...saved.result },
    { headers: { "cache-control": "no-store" } },
  );
}
