import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import type {
  AssistantAskRequest,
  AssistantAskResponse,
} from "@/features/agent/assistant/types";
import { AssistantContextValidationError } from "@/features/agent/assistant/server/trustedContext";


async function requireUser(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

async function resolveProfile(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  userId: string,
): Promise<{ shopId: string | null; role: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { shopId: null, role: null };
  }

  return {
    shopId: data?.shop_id ?? null,
    role: data?.role ?? null,
  };
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseRoute();

  const user = await requireUser(supabase);
  if (!user) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const profile = await resolveProfile(supabase, user.id);
  if (!profile.shopId) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "No shop found for user" },
      { status: 400 },
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
  if (body.messages !== undefined && (!Array.isArray(body.messages) ||
    body.messages.length > 20 || body.messages.some((message) =>
      !message || (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" || message.content.length > 4000))) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Conversation history is invalid" },
      { status: 400 },
    );
  }
  if (body.imageAttachments !== undefined &&
    (!Array.isArray(body.imageAttachments) || body.imageAttachments.length > 3)) {
    return NextResponse.json<AssistantAskResponse>(
      { ok: false, error: "Too many image attachments" },
      { status: 400 },
    );
  }

  try {
    const answer = await answerAssistant({
      shopId: profile.shopId,
      userId: user.id,
      role: profile.role,
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
