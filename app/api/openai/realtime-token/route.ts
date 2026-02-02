import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ----------------------------- Types ----------------------------- */

type OpenAIRealtimeSessionConfig = {
  session: {
    type: "transcription";
    audio: {
      input: {
        format: {
          type: "audio/pcm";
          rate: number;
        };
        noise_reduction?: {
          type: "near_field" | "far_field";
        };
        transcription: {
          model: string;
          language?: string;
        };
        turn_detection?: {
          type: "server_vad";
          threshold?: number;
          prefix_padding_ms?: number;
          silence_duration_ms?: number;
        };
      };
    };
  };
};


/* --------------------------- Helpers ---------------------------- */

function extractToken(
  data: unknown,
): { token: string; expiresAt?: number } | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "value" in data &&
    typeof (data as { value?: unknown }).value === "string"
  ) {
    const d = data as { value: string; expires_at?: number };
    return { token: d.value, expiresAt: d.expires_at };
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "client_secret" in data
  ) {
    const cs = (data as { client_secret?: unknown }).client_secret;
    if (
      typeof cs === "object" &&
      cs !== null &&
      "value" in cs &&
      typeof (cs as { value?: unknown }).value === "string"
    ) {
      const secret = cs as { value: string; expires_at?: number };
      return { token: secret.value, expiresAt: secret.expires_at };
    }
  }

  return null;
}

/* ----------------------------- Route ----------------------------- */

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("[realtime-token] Missing OPENAI_API_KEY");
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 },
      );
    }

    const sessionConfig: OpenAIRealtimeSessionConfig = {
      session: {
        type: "transcription",
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000,
            },
            noise_reduction: {
              type: "near_field",
            },
            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "en",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        },
      },
    };

    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionConfig),
      },
    );

    const rawText = await response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("[realtime-token] Invalid JSON from OpenAI", rawText);
      return NextResponse.json(
        { error: "Invalid JSON from OpenAI" },
        { status: 500 },
      );
    }

    if (!response.ok) {
      console.error("[realtime-token] OpenAI error", {
        status: response.status,
        statusText: response.statusText,
        body: parsed,
      });

      return NextResponse.json(
        {
          error: "Failed to mint realtime transcription token",
          upstreamStatus: response.status,
        },
        { status: 500 },
      );
    }

    const extracted = extractToken(parsed);

    if (!extracted) {
      console.error(
        "[realtime-token] Unexpected response shape",
        parsed,
      );
      return NextResponse.json(
        { error: "Unexpected token response shape" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        token: extracted.token,
        expiresAt: extracted.expiresAt ?? null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[realtime-token] Unhandled error", err);
    return NextResponse.json(
      { error: "Unhandled realtime token error" },
      { status: 500 },
    );
  }
}