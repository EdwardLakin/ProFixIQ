import { NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(_: Request, ctx: unknown) {
  const { params } = ctx as { params: { slug: string } };
  const { slug } = params;

  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const url = `${base}/portal/booking?shop=${encodeURIComponent(slug)}`;

  const dataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    errorCorrectionLevel: "H",
    width: 512,
    color: {
      dark: "#f60a00",
      light: "#00000000",
    },
  });

  const pngBase64 = dataUrl.split(",")[1];
  const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));

  return new NextResponse(pngBytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=600",
    },
  });
}