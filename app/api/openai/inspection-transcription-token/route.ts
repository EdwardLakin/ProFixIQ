import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getOpenAIInspectionTranscriptionModel } from "@/features/shared/lib/openai-realtime-models";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientSecretResponse = {
  value?: unknown;
  expires_at?: unknown;
  client_secret?: { value?: unknown; expires_at?: unknown };
};

function extractSecret(value: unknown): { token: string; expiresAt: number | null } | null {
  if (!value || typeof value !== "object") return null;
  const body = value as ClientSecretResponse;
  const token =
    typeof body.value === "string"
      ? body.value
      : typeof body.client_secret?.value === "string"
        ? body.client_secret.value
        : "";
  if (!token) return null;
  const expires =
    typeof body.expires_at === "number"
      ? body.expires_at
      : typeof body.client_secret?.expires_at === "number"
        ? body.client_secret.expires_at
        : null;
  return { token, expiresAt: expires };
}

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canRunInspections",
  });
  if (!access.ok) return access.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Inspection voice is not configured", code: "inspection_voice_not_configured" },
      { status: 503 },
    );
  }

  const model = getOpenAIInspectionTranscriptionModel();
  const policy = getAIPolicy("openai_realtime_token");

  try {
    const response = await Promise.race([
      fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                noise_reduction: { type: "near_field" },
                transcription: {
                  model,
                  languages: ["en"],
                  delay: "low",
                  prompt:
                    "Vehicle inspection in a repair shop. Expect automotive and heavy-duty terminology, measurements, brake readings, tire tread depths, defects, pass, fail, recommend, and component names.",
                },
                turn_detection: null,
              },
            },
          },
        }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI request timed out")), policy.timeoutMs),
      ),
    ]);

    const parsed = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return NextResponse.json(
        { error: "Inspection voice could not start", code: "inspection_voice_rejected" },
        { status: 502 },
      );
    }

    const secret = extractSecret(parsed);
    if (!secret) {
      return NextResponse.json(
        { error: "Inspection voice returned an invalid token", code: "inspection_voice_invalid_response" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        token: secret.token,
        expiresAt: secret.expiresAt,
        transcriptionModel: model,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    const timedOut =
      caught instanceof Error && caught.message === "AI request timed out";
    return NextResponse.json(
      {
        error: timedOut
          ? "Inspection voice took too long to connect"
          : "Inspection voice could not start",
        code: timedOut ? "inspection_voice_timeout" : "inspection_voice_error",
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
