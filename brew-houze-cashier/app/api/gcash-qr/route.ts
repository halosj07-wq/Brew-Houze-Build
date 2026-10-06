import { NextResponse } from "next/server";
import { gcashAccount, gcashMethod, gcashQrImage } from "@/lib/gcash";

// The café's GCash QR (direct GCash, set in Admin → Treasury), for customers to pay. Public: it is
// printed at the counter anyway. Pages add ?v=<version> so a new QR shows at once.
// ?info=1: whether this deployment uses the café's own QR, and the account it pays (for the signs).
export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get("info") === "1") {
      if (gcashMethod() !== "direct_qr") return NextResponse.json({ data: { direct: false } }, { headers: { "Cache-Control": "no-store" } });
      const account = await gcashAccount();
      return NextResponse.json({ data: { direct: true, ready: account.hasQr, accountName: account.name, accountNumber: account.number, qrVersion: account.version } }, { headers: { "Cache-Control": "no-store" } });
    }
    if (gcashMethod() !== "direct_qr") return new Response("Not found", { status: 404 });
    const image = await gcashQrImage();
    if (!image) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(image.bytes), { headers: { "Content-Type": image.mime, "Cache-Control": "public, max-age=300", "Content-Disposition": "inline; filename=\"brew-houze-gcash-qr\"" } });
  } catch (error) {
    console.error("GET /api/gcash-qr failed:", error);
    return new Response("Could not load the QR", { status: 500 });
  }
}
