import { NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;

  const base =
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const url = `${base}/portal/booking?shop=${encodeURIComponent(slug)}`;

  const dataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    errorCorrectionLevel: "H",
    width: 512,
    color: {
      dark: "#f60a00", // your orange
      light: "#00000000", // transparent
    },
  });

  // Strip the "data:image/png;base64," and convert to Uint8Array
  const pngBase64 = dataUrl.split(",")[1];
  const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));

  return new NextResponse(pngBytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=600",
    },
  });
}