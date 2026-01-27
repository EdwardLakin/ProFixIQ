// app/api/openai/realtime-token/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("[realtime-token] Missing OPENAI_API_KEY in environment");
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 },
      );
    }

    // Mint an ephemeral Realtime client secret (aka ephemeral token).
    // Docs: POST /v1/realtime/client_secrets returns { value: "..." }  [oai_citation:2‡OpenAI Platform](https://platform.openai.com/docs/guides/realtime-webrtc)
    const sessionConfig = {
      session: {
        // keep it minimal — you can add more later
        type: "realtime",
        // You can omit model here; token still works. If you include it, it must be a valid realtime model.
        // model: "gpt-realtime",
      },
    };

    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    const text = await r.text();
    let data: unknown = null;

    try {
      data = JSON.parse(text);
    } catch {
      // keep raw text below for logs
    }

    if (!r.ok) {
      console.error("[realtime-token] OpenAI error", {
        status: r.status,
        statusText: r.statusText,
        body: data ?? text,
      });

      return NextResponse.json(
        {
          error: "Failed to mint realtime token",
          upstreamStatus: r.status,
        },
        { status: 500 },
      );
    }

    const token =
      typeof (data as { value?: unknown })?.value === "string"
        ? (data as { value: string }).value
        : null;

    if (!token) {
      console.error("[realtime-token] Unexpected response shape", data);
      return NextResponse.json(
        { error: "Unexpected token response shape" },
        { status: 500 },
      );
    }

    // Client expects { token }
    return NextResponse.json({ token }, { status: 200 });
  } catch (err: unknown) {
    console.error("[realtime-token] Unhandled error", err);
    return NextResponse.json(
      { error: "Unhandled realtime token error" },
      { status: 500 },
    );
  }
}