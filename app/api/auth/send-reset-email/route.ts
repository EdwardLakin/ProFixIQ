import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { email } = await req.json();
  const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`;

  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-reset-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, resetUrl }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Reset email error:", error);
    return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}