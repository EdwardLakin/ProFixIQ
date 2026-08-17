import { NextResponse, type NextRequest } from "next/server";
import {
  requireTechnicianCopilotAccess,
  TechnicianCopilotAccessError,
} from "@/features/copilot/technician/server/auth";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import {
  enforceAIOperationalPolicy,
  estimateAISpeechCostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import {
  getOpenAIClient,
  isOpenAIConfigured,
} from "@/features/shared/lib/server/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ENDPOINT = "/api/copilot/technician/speech";
const FEATURE = "technician_copilot_speech" as const;
const SPEECH_MODEL = "gpt-4o-mini-tts" as const;
const SPEECH_VOICE = "marin" as const;
const MAX_SPEECH_CHARACTERS = 4_000;

type TechnicianCopilotAccess = Awaited<
  ReturnType<typeof requireTechnicianCopilotAccess>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function recordSpeechResult(input: {
  access: TechnicianCopilotAccess;
  startedAt: number;
  textLength: number;
  status: "success" | "error";
  errorCode: string | null;
  errorMessage: string | null;
}): void {
  const estimatedCostUsd =
    input.status === "success"
      ? estimateAISpeechCostUsd(input.textLength)
      : 0;

  recordAITelemetry({
    feature: FEATURE,
    endpoint: ENDPOINT,
    shop_id: input.access.shopId,
    user_id: input.access.profileId,
    model: SPEECH_MODEL,
    latency_ms: Date.now() - input.startedAt,
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    estimated_cost_usd: estimatedCostUsd,
    status: input.status,
    error_code: input.errorCode,
    error_message: input.errorMessage,
  });
  registerAIUsageEvent({
    feature: FEATURE,
    endpoint: ENDPOINT,
    shopId: input.access.shopId,
    model: SPEECH_MODEL,
    totalTokens: null,
    estimatedCostUsd,
    status: input.status,
    errorCode: input.errorCode,
  });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let access: TechnicianCopilotAccess;

  try {
    access = await requireTechnicianCopilotAccess();
  } catch (caught) {
    if (caught instanceof TechnicianCopilotAccessError) {
      return NextResponse.json(
        { error: caught.message, code: caught.code },
        { status: caught.status },
      );
    }
    console.error("[technician-copilot-speech] Access check failed", caught);
    return NextResponse.json(
      { error: "Technician CoPilot access could not be verified." },
      { status: 500 },
    );
  }

  if (!access.capabilities.voice) {
    return NextResponse.json(
      {
        error: "Technician CoPilot voice is not enabled.",
        code: "technician_copilot_voice_disabled",
      },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "A valid JSON request body is required." },
      { status: 400 },
    );
  }

  const rawText = isRecord(body) ? body.text : null;
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text || text.length > MAX_SPEECH_CHARACTERS) {
    return NextResponse.json(
      {
        error: `Speech text must contain 1-${MAX_SPEECH_CHARACTERS} characters.`,
        code: "invalid_speech_text",
      },
      { status: 400 },
    );
  }

  if (!isOpenAIConfigured()) {
    recordSpeechResult({
      access,
      startedAt,
      textLength: text.length,
      status: "error",
      errorCode: "speech_not_configured",
      errorMessage: "OPENAI_API_KEY is not configured",
    });
    return NextResponse.json(
      {
        error: "Generated CoPilot voice is not configured.",
        code: "speech_not_configured",
      },
      { status: 503 },
    );
  }

  const enforcement = enforceAIOperationalPolicy({
    feature: FEATURE,
    endpoint: ENDPOINT,
    shopId: access.shopId,
  });
  if (!enforcement.allowed) {
    recordSpeechResult({
      access,
      startedAt,
      textLength: text.length,
      status: "error",
      errorCode: enforcement.code,
      errorMessage: enforcement.reason,
    });
    return NextResponse.json(
      {
        error: "Generated CoPilot voice is temporarily limited.",
        code: enforcement.code,
      },
      { status: 429 },
    );
  }

  const controller = new AbortController();
  const policy = getAIPolicy(FEATURE);
  const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);

  try {
    const speech = await getOpenAIClient().audio.speech.create(
      {
        model: SPEECH_MODEL,
        voice: SPEECH_VOICE,
        input: text,
        instructions:
          "Speak clearly, naturally, and professionally for a working automotive technician. Do not add or omit information.",
        response_format: "mp3",
      },
      { signal: controller.signal },
    );
    const audio = await speech.arrayBuffer();
    if (audio.byteLength === 0) {
      throw new Error("OpenAI returned an empty speech response");
    }

    recordSpeechResult({
      access,
      startedAt,
      textLength: text.length,
      status: "success",
      errorCode: null,
      errorMessage: null,
    });

    return new Response(audio, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "audio/mpeg",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (caught) {
    const timedOut = controller.signal.aborted;
    const errorCode = timedOut
      ? "speech_upstream_timeout"
      : "speech_generation_failed";
    const message =
      caught instanceof Error ? caught.message : "Speech generation failed";

    recordSpeechResult({
      access,
      startedAt,
      textLength: text.length,
      status: "error",
      errorCode,
      errorMessage: message,
    });
    console.error("[technician-copilot-speech] Generation failed", {
      errorCode,
      message,
    });
    return NextResponse.json(
      {
        error: timedOut
          ? "Generated CoPilot voice took too long to respond."
          : "Generated CoPilot voice could not be created.",
        code: errorCode,
      },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
