export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Accept `data` or `url` param (both common)
  const raw = searchParams.get("data") ?? searchParams.get("url") ?? "";
  const data = raw.trim();

  if (!data) {
    return NextResponse.json(
      { error: "Missing required query param: data (or url)" },
      { status: 400 },
    );
  }

  // Simple, dependency-free QR generation via Google Chart image endpoint
  // Example: /api/portal/qr?data=https%3A%2F%2Fprofixiq.com%2Fportal%2Fbooking%3Fshop%3Ddemo
  const size = searchParams.get("size")?.trim() || "300x300";
  const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=${encodeURIComponent(
    size,
  )}&chl=${encodeURIComponent(data)}&choe=UTF-8`;

  return NextResponse.redirect(qrUrl, { status: 302 });
}
