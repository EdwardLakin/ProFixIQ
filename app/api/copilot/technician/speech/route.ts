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
import { recordDurableAIUsage } from "@/features/shared/lib/server/ai-telemetry";
import { isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import {
  synthesizeNaturalSpeech,
  NATURAL_SPEECH_MODEL,
  NATURAL_SPEECH_MAX_CHARACTERS,
} from "@/features/shared/lib/server/naturalSpeech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ENDPOINT = "/api/copilot/technician/speech";
const FEATURE = "technician_copilot_speech" as const;
const SPEECH_MODEL = NATURAL_SPEECH_MODEL;
const MAX_SPEECH_CHARACTERS = NATURAL_SPEECH_MAX_CHARACTERS;

type TechnicianCopilotAccess = Awaited<
  ReturnType<typeof requireTechnicianCopilotAccess>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function recordSpeechResult(input: {
  access: TechnicianCopilotAccess;
  startedAt: number;
  textLength: number;
  status: "success" | "error";
  errorCode: string | null;
  errorMessage: string | null;
}): Promise<void> {
  // Keep the existing estimate for the legacy in-memory operational guard.
  // The durable ledger independently leaves gpt-4o-mini-tts cost null because
  // OpenAI bills this model by text/audio tokens and this endpoint receives no
  // provider usage object with those billable units.
  const legacyEstimatedCostUsd =
    input.status === "success"
      ? estimateAISpeechCostUsd(input.textLength)
      : 0;

  await recordDurableAIUsage({
    feature: FEATURE,
    endpoint: ENDPOINT,
    shop_id: input.access.shopId,
    user_id: input.access.profileId,
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
    shopId: input.access.shopId,
    model: SPEECH_MODEL,
    totalTokens: null,
    estimatedCostUsd: legacyEstimatedCostUsd,
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

  // Checked before the rate/budget policy (and thus before ever spending
  // an enforcement slot) so a misconfigured deployment always gets this
  // exact, actionable 503 — never a confusing 429 once enough requests
  // have piled up against the policy while the key is missing.
  if (!isOpenAIConfigured()) {
    await recordSpeechResult({
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
    await recordSpeechResult({
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

  const policy = getAIPolicy(FEATURE);
  const result = await synthesizeNaturalSpeech({
    text,
    timeoutMs: policy.timeoutMs,
  });

  if (!result.ok) {
    await recordSpeechResult({
      access,
      startedAt,
      textLength: text.length,
      status: "error",
      errorCode: result.code,
      errorMessage: result.message,
    });
    console.error("[technician-copilot-speech] Generation failed", {
      errorCode: result.code,
      message: result.message,
    });
    return NextResponse.json(
      {
        error:
          result.code === "speech_upstream_timeout"
            ? "Generated CoPilot voice took too long to respond."
            : "Generated CoPilot voice could not be created.",
        code: result.code,
      },
      { status: result.status },
    );
  }

  await recordSpeechResult({
    access,
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
