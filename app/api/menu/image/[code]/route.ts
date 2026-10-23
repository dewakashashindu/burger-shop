import { connection } from "next/server";
import { readMenuImage } from "@/lib/menu-source";
import { isDbReady } from "@/lib/db";

function detectType(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/png";
}

/**
 * GET /api/menu/image/[code]
 * Serves dbo.Tbl_MenuItems.ItemPicMob as an image, so the browser never receives
 * the database binary inside the JSON payload.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code } = await params;
  if (!(await isDbReady())) return new Response(null, { status: 404 });
  try {
    const picture = await readMenuImage(decodeURIComponent(code));
    if (!picture) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(picture), {
      headers: {
        "content-type": detectType(picture),
        "cache-control": "public, max-age=600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[menu] image read failed:", error);
    return new Response(null, { status: 503 });
  }
}
