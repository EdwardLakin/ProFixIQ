// app/api/assistant/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import type {
  AssistantAskContext,
  AssistantAskSession,
} from "@/features/agent/assistant/types";

type DB = Database;

async function requireUser(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

async function resolveProfile(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
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

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const user = await requireUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await resolveProfile(supabase, user.id);
  if (!profile.shopId) {
    return NextResponse.json({ error: "No shop found" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    query?: unknown;
    context?: AssistantAskContext;
    session?: AssistantAskSession;
  };

  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json(
      { error: "Query is required" },
      { status: 400 },
    );
  }

  try {
    const answer = await answerAssistant({
      shopId: profile.shopId,
      userId: user.id,
      role: profile.role,
      request: {
        question: query,
        context: body.context,
        session: body.session,
      },
    });

    return NextResponse.json({
      summary: answer.summary,
      bullets: answer.bullets,
      actions: answer.actions.map((action) =>
        action.type === "link"
          ? {
              kind: "link",
              label: action.label,
              href: action.href,
            }
          : {
              kind: "planner",
              label: action.label,
              plannerPayload: {
                goal: action.goal,
                planner:
                  action.context?.planner === "approvals" ||
                  action.context?.planner === "fleet" ||
                  action.context?.planner === "simple" ||
                  action.context?.planner === "openai"
                    ? action.context.planner
                    : "ops",
                customerQuery:
                  typeof action.context?.customerQuery === "string"
                    ? action.context.customerQuery
                    : undefined,
                customerId:
                  typeof action.context?.customerId === "string"
                    ? action.context.customerId
                    : answer.resolvedContext?.customerId,
                vehicleId:
                  typeof action.context?.vehicleId === "string"
                    ? action.context.vehicleId
                    : answer.resolvedContext?.vehicleId,
                bookingId:
                  typeof action.context?.bookingId === "string"
                    ? action.context.bookingId
                    : answer.resolvedContext?.bookingId,
                workOrderId:
                  typeof action.context?.workOrderId === "string"
                    ? action.context.workOrderId
                    : answer.resolvedContext?.workOrderId,
                allowCreate:
                  typeof action.context?.allowCreate === "boolean"
                    ? action.context.allowCreate
                    : false,
              },
            },
      ),
      notifications: answer.entities.map((entity, idx) => ({
        level: "info",
        code: `entity_${idx + 1}`,
        title: entity.label,
        message: entity.type,
        href: entity.href,
        entityType: entity.type,
        entityId: entity.id,
      })),
      relatedRecords: [
        ...answer.links.map((link) => ({ label: link.label, href: link.href, type: "link" })),
        ...answer.entities.map((entity) => ({
          label: entity.label,
          href: entity.href,
          type: entity.type,
        })),
      ],
      resolvedContext: answer.resolvedContext,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Assistant failed",
      },
      { status: 500 },
    );
  }
}
