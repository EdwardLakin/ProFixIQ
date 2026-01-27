// app/api/openai/realtime-token/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 },
    );
  }

  // Create a short-lived client secret for Realtime transcription
  // (ephemeral token to be used client-side)
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // keep this short; adjust as needed
      expires_in: 60,
      // scope it to transcription sessions if you want (recommended)
      // depending on your account/project settings
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to create realtime client secret", detail: text },
      { status: 500 },
    );
  }

  const data = (await res.json()) as {
    client_secret?: { value?: string };
  };

  const token = data?.client_secret?.value;
  if (!token) {
    return NextResponse.json(
      { error: "Malformed client_secret response" },
      { status: 500 },
    );
  }

  return NextResponse.json({ token });
}