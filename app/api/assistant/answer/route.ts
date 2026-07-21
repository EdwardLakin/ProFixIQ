import { NextResponse } from "next/server";
import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import { AssistantContextValidationError } from "@/features/agent/assistant/server/trustedContext";
import type {
  AssistantAskRequest,
  AssistantAskResponse,
} from "@/features/agent/assistant/types";
import { handleShopAssistantRequest } from "@/features/assistant/server/handleShopAssistantRequest";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidConversationHistory(body: AssistantAskRequest): boolean {
  return Boolean(
    body.messages !== undefined &&
      (!Array.isArray(body.messages) ||
        body.messages.length > 20 ||
        body.messages.some(
          (message) =>
            !message ||
            (message.role !== "user" && message.role !== "assistant") ||
            typeof message.content !== "string" ||
            message.content.length > 4000,
        )),
  );
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

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
  if (body.surface !== undefined && body.surface !== "shop" && body.surface !== "technician") {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Assistant surface is invalid" },
      { status: 400 },
    );
  }
  if (body.conversationId !== undefined && !UUID_PATTERN.test(body.conversationId)) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Conversation id is invalid" },
      { status: 400 },
    );
  }
  if (body.clientRequestId !== undefined && !UUID_PATTERN.test(body.clientRequestId)) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Client request id is invalid" },
      { status: 400 },
    );
  }
  if (invalidConversationHistory(body)) {
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
    const answer =
      body.surface === "shop"
        ? await handleShopAssistantRequest({
            supabase: access.supabase,
            shopId: access.profile.shop_id,
            userId: access.profile.id,
            role: access.profile.role,
            request: body,
          })
        : await answerAssistant({
            shopId: access.profile.shop_id,
            userId: access.profile.id,
            role: access.profile.role,
            request: body,
          });

    return NextResponse.json<AssistantAskResponse>({
      ok: true,
      answer,
    });
  } catch (error: unknown) {
    const status = error instanceof AssistantContextValidationError ? 400 : 500;
    return NextResponse.json<AssistantAskResponse>(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to answer assistant question",
      },
      { status },
    );
  }
}
