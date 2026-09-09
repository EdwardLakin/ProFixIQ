import { NextResponse, type NextRequest } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { WORKFORCE_STAFF_ROLES } from "@/features/workforce/lib/roster";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import {
  enforceAIOperationalPolicy,
  estimateAISpeechCostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";
import { recordDurableAIUsage } from "@/features/shared/lib/server/ai-telemetry";
import {
  synthesizeNaturalSpeech,
  NATURAL_SPEECH_MODEL,
  NATURAL_SPEECH_MAX_CHARACTERS,
} from "@/features/shared/lib/server/naturalSpeech";

// Natural-voice spoken feedback for inspection voice control
// (GenericInspectionScreen.tsx's speak()), mirroring
// /api/copilot/technician/speech/route.ts exactly — same shared TTS call,
// same telemetry/policy shape — but scoped to whoever can already run an
// inspection (any shop staff role), not gated behind the Technician
// CoPilot's own text/voice capability toggle, which is a separate feature
// inspection voice control has never depended on.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ENDPOINT = "/api/inspections/speech";
const FEATURE = "inspection_voice_speech" as const;
const SPEECH_MODEL = NATURAL_SPEECH_MODEL;
const MAX_SPEECH_CHARACTERS = NATURAL_SPEECH_MAX_CHARACTERS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function recordSpeechResult(input: {
  shopId: string;
  userId: string;
  startedAt: number;
  textLength: number;
  status: "success" | "error";
  errorCode: string | null;
  errorMessage: string | null;
}): Promise<void> {
  // Same split as /api/copilot/technician/speech/route.ts: the legacy
  // in-memory operational guard keeps its own estimate, while the durable
  // ledger leaves gpt-4o-mini-tts cost null (OpenAI bills this model by
  // text/audio tokens and this endpoint gets no provider usage object with
  // those billable units).
  const legacyEstimatedCostUsd =
    input.status === "success"
      ? estimateAISpeechCostUsd(input.textLength)
      : 0;

  await recordDurableAIUsage({
    feature: FEATURE,
    endpoint: ENDPOINT,
    shop_id: input.shopId,
    user_id: input.userId,
    provider: "openai",
    model: SPEECH_MODEL,
    modality: "speech",
    latency_ms: Date.now() - input.startedAt,
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    speech_characters: input.textLength,
    estimated_cost_usd: legacyEstimatedCostUsd,
    status: input.status,
    error_code: input.errorCode,
    error_message: input.errorMessage,
  });
  registerAIUsageEvent({
    feature: FEATURE,
    endpoint: ENDPOINT,
    shopId: input.shopId,
    model: SPEECH_MODEL,
    totalTokens: null,
    estimatedCostUsd: legacyEstimatedCostUsd,
    status: input.status,
    errorCode: input.errorCode,
  });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  const access = await requireShopScopedApiAccess({
    allowRoles: [...WORKFORCE_STAFF_ROLES],
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  const userId = access.authUserId;

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

  const enforcement = enforceAIOperationalPolicy({
    feature: FEATURE,
    endpoint: ENDPOINT,
    shopId,
  });
  if (!enforcement.allowed) {
    await recordSpeechResult({
      shopId,
      userId,
      startedAt,
      textLength: text.length,
      status: "error",
      errorCode: enforcement.code,
      errorMessage: enforcement.reason,
    });
    return NextResponse.json(
      {
        error: "Generated voice is temporarily limited.",
        code: enforcement.code,
      },
      { status: 429 },
    );
  }

  const policy = getAIPolicy(FEATURE);
  const result = await synthesizeNaturalSpeech({
    text,
    timeoutMs: policy.timeoutMs,
  });

  if (!result.ok) {
    await recordSpeechResult({
      shopId,
      userId,
      startedAt,
      textLength: text.length,
      status: "error",
      errorCode: result.code,
      errorMessage: result.message,
    });
    console.error("[inspection-speech] Generation failed", {
      errorCode: result.code,
      message: result.message,
    });
    return NextResponse.json(
      {
        error:
          result.code === "speech_upstream_timeout"
            ? "Generated voice took too long to respond."
            : "Generated voice could not be created.",
        code: result.code,
      },
      { status: result.status },
    );
  }

  await recordSpeechResult({
    shopId,
    userId,
    startedAt,
    textLength: text.length,
    status: "success",
    errorCode: null,
    errorMessage: null,
  });

  return new Response(result.audio, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "audio/mpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
