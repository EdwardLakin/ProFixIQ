import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { answerPortalAssistant } from "@/features/portal/assistant/server/answerPortalAssistant";
import type { PortalAssistantContext, PortalAssistantMessage } from "@/features/portal/assistant/types";

type Body = {
  question?: string;
  context?: PortalAssistantContext;
  messages?: PortalAssistantMessage[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = createServerSupabaseRoute();
  try {
    const actor = await requirePortalCustomerActor(supabase);
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body.question !== "string" || !body.question.trim() || body.question.length > 4000) {
      return NextResponse.json({ error: "A valid question is required" }, { status: 400 });
    }
    if (body.messages !== undefined && (!Array.isArray(body.messages) || body.messages.length > 12 ||
      body.messages.some((message) => !message ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" || message.content.length > 2000))) {
      return NextResponse.json({ error: "Conversation history is invalid" }, { status: 400 });
    }
    if (body.context?.workOrderId && !UUID_PATTERN.test(body.context.workOrderId)) {
      return NextResponse.json({ error: "Work order context is invalid" }, { status: 400 });
    }
    const answer = await answerPortalAssistant({
      supabase,
      actor,
      question: body.question,
      context: body.context,
      messages: body.messages,
    });
    return NextResponse.json({ ok: true, answer });
  } catch (error) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to answer portal question" },
      { status: 500 },
    );
  }
}
