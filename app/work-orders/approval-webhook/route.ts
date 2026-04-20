import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const targetUrl = new URL("/api/quotes/approval-webhook", req.url);
  return NextResponse.redirect(targetUrl, { status: 307 });
}
