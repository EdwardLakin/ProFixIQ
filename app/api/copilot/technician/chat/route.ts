import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  requireTechnicianCopilotAccess,
  TechnicianCopilotAccessError,
} from "@/features/copilot/technician/server/auth";
import {
  runTechnicianCopilotTurn,
  TechnicianCopilotConflictError,
} from "@/features/copilot/technician/server/chat";
import { withAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  estimateCopilotTurnCostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";
import {
  claimDurableAIRouteQuota,
  completeDurableAIRouteQuota,
} from "@/features/shared/lib/server/durable-ai-guard";

export const runtime = "nodejs";

const MAX_RECENT_CONVERSATIONS = 5;

type RecentConversationHint = { conversationId: string; title: string | null };

function parseRecentConversations(value: unknown): RecentConversationHint[] {
  if (!Array.isArray(value)) return [];
  const hints: RecentConversationHint[] = [];
  for (const candidate of value) {
    if (hints.length >= MAX_RECENT_CONVERSATIONS) break;
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const conversationId =
      typeof record.conversationId === "string"
        ? record.conversationId.trim().slice(0, 128)
        : "";
    if (!conversationId) continue;
    const title =
      typeof record.title === "string" ? record.title.trim().slice(0, 200) : null;
    hints.push({ conversationId, title: title || null });
  }
  return hints;
}

function runtimeConflict(error: unknown): TechnicianCopilotConflictError | null {
  if (error instanceof TechnicianCopilotConflictError) return error;
  const message = error instanceof Error ? error.message : "";
  if (
    message === "copilot_session_not_active" ||
    message === "copilot_work_order_not_actionable" ||
    message === "copilot_work_order_assignment_required"
  ) {
    return new TechnicianCopilotConflictError(
      "technician_copilot_session_stale",
      "The active CoPilot repair context changed. Reload before continuing.",
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireTechnicianCopilotAccess();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 4000) {
      return NextResponse.json(
        { error: "Message is required and must be 4000 characters or less." },
        { status: 400 },
      );
    }

    const inputSource = body.inputMode === "voice" ? "voice" : "ui";
    if (inputSource === "voice" && !access.capabilities.voice) {
      return NextResponse.json(
        {
          error: "Technician CoPilot voice is not enabled.",
          code: "technician_copilot_voice_disabled",
        },
        { status: 404 },
      );
    }

    // The CoPilot turn runs two model calls and was previously the only AI
    // route with no spend ceiling at all. 120 turns / 5 min is far above any
    // human conversational rate, so this bounds a runaway without touching
    // ordinary technician use.
    // Durable ceiling on the platform's highest-frequency AI call. Unlike the
    // in-memory operational guard this survives serverless restarts, so it is a
    // real cap rather than a per-instance one. A quota outage must not take the
    // CoPilot down, so an unavailable RPC fails open and is logged.
    const admin = createAdminSupabase();
    let claim: Awaited<ReturnType<typeof claimDurableAIRouteQuota>> | null = null;
    try {
      claim = await claimDurableAIRouteQuota({
        admin,
        feature: "technician_copilot_text",
        shopId: access.shopId,
        actorId: access.profileId,
      });
    } catch (error) {
      console.error("technician_copilot_quota_unavailable", {
        shopId: access.shopId,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
      });
    }

    if (claim && !claim.allowed) {
      return NextResponse.json(
        {
          error:
            claim.reason === "hard_budget_exceeded"
              ? "This shop has reached its monthly CoPilot budget."
              : "CoPilot is temporarily rate limited for this shop. Retry shortly.",
          code: claim.reason,
        },
        {
          status: 429,
          headers: { "Retry-After": String(claim.retryAfterSeconds) },
        },
      );
    }
    const receiptId = claim?.allowed ? claim.receiptId : null;

    const turnId =
      typeof body.turnId === "string" && body.turnId.trim()
        ? body.turnId.trim().slice(0, 128)
        : randomUUID();
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const recentConversations = parseRecentConversations(body.recentConversations);

    const settleReceipt = async (succeeded: boolean) => {
      if (!receiptId) return;
      await completeDurableAIRouteQuota({
        admin,
        feature: "technician_copilot_text",
        shopId: access.shopId,
        actorId: access.profileId,
        receiptId,
        actualCostUsd: succeeded ? estimateCopilotTurnCostUsd() : 0,
        succeeded,
      });
    };

    let result: Awaited<ReturnType<typeof runTechnicianCopilotTurn>>;
    try {
      result = await withAITelemetryContext(
      {
        endpoint: "/api/copilot/technician/chat",
        shopId: access.shopId,
        userId: access.profileId,
      },
      () =>
        runTechnicianCopilotTurn({
          identity: {
            authUserId: access.authUserId,
            profileId: access.profileId,
            shopId: access.shopId,
            documentationEnabled: access.capabilities.documentation,
            voiceEnabled: access.capabilities.voice,
            supabase: createAdminSupabase(),
          },
          message,
          turnId,
          sessionId,
          inputSource,
          recentConversations,
        }),
      );
    } catch (error) {
      // A claimed reservation must always settle, or it counts against the
      // shop's window and budget until the 30-minute stale sweep reclaims it.
      await settleReceipt(false);
      throw error;
    }

    await settleReceipt(true);

    // Also advance the in-memory operational counters, which drive the anomaly
    // alerts (spike, high-cost, repeated-denial). The durable receipt above is
    // the actual ceiling.
    registerAIUsageEvent({
      feature: "technician_copilot_text",
      endpoint: "/api/copilot/technician/chat",
      shopId: access.shopId,
      model: null,
      totalTokens: null,
      estimatedCostUsd: estimateCopilotTurnCostUsd(),
      status: "success",
      errorCode: null,
    });

    return NextResponse.json({ ...result, turnId });
  } catch (error) {
    if (error instanceof TechnicianCopilotAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const conflict = runtimeConflict(error);
    if (conflict) {
      return NextResponse.json(
        { error: conflict.message, code: conflict.code },
        { status: conflict.status },
      );
    }
    console.error("[technician-copilot] chat failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Technician CoPilot failed." },
      { status: 500 },
    );
  }
}
