import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email, link } = await req.json();
  // TODO: wire to your email service (Resend, SES, SMTP, etc.)
  console.log("[portal invite] send to:", email, "link:", link);
  return NextResponse.json({ ok: true });
}