import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import type {
  AssistantAskRequest,
  AssistantAskResponse,
} from "@/features/agent/assistant/types";
import { AssistantContextValidationError } from "@/features/agent/assistant/server/trustedContext";
import {
  requireShopAssistantActor,
  resolveShopAssistantError,
} from "@/features/shop-assistant/server/requireShopAssistantActor";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const supabase = createServerSupabaseRoute();
  let actor: Awaited<ReturnType<typeof requireShopAssistantActor>>;
  try {
    actor = await requireShopAssistantActor(supabase);
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "legacy-assistant-answer-auth",
    );
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: resolved.message },
      { status: resolved.status },
    );
  }

  let body: AssistantAskRequest;
  try {
    body = (await request.json()) as AssistantAskRequest;
  } catch {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Question is required" },
      { status: 400 },
    );
  }
  if (body.question.length > 8000) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Question is too long" },
      { status: 400 },
    );
  }
  if (
    body.messages !== undefined &&
    (!Array.isArray(body.messages) ||
      body.messages.length > 20 ||
      body.messages.some(
        (message) =>
          !message ||
          (message.role !== "user" && message.role !== "assistant") ||
          typeof message.content !== "string" ||
          message.content.length > 4000,
      ))
  ) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Conversation history is invalid" },
      { status: 400 },
    );
  }
  if (
    body.imageAttachments !== undefined &&
    (!Array.isArray(body.imageAttachments) || body.imageAttachments.length > 3)
  ) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Too many image attachments" },
      { status: 400 },
    );
  }

  try {
    const answer = await answerAssistant({
      shopId: actor.shopId,
      userId: actor.userId,
      profileId: actor.profileId,
      role: actor.role,
      request: body,
    });

    return NextResponse.json<AssistantAskResponse>({
      ok: true,
      answer,
    });
  } catch (error: unknown) {
    const resolved =
      error instanceof AssistantContextValidationError
        ? { status: 400, message: error.message }
        : resolveShopAssistantError(error, "legacy-assistant-answer");
    return NextResponse.json<AssistantAskResponse>(
      {
        ok: false,
        error: resolved.message,
      },
      { status: resolved.status },
    );
  }
}
