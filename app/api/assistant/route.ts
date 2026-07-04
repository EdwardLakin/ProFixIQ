// app/api/assistant/route.ts

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import type {
  AssistantAskContext,
  AssistantAskSession,
  AssistantConversationMessage,
  AssistantVehicleContext,
} from "@/features/agent/assistant/types";

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

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

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
    question?: unknown;
    context?: AssistantAskContext;
    session?: AssistantAskSession;
    messages?: AssistantConversationMessage[];
    vehicle?: AssistantVehicleContext;
  };

  const query =
    typeof body.query === "string"
      ? body.query.trim()
      : typeof body.question === "string"
        ? body.question.trim()
        : "";

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
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
        messages: Array.isArray(body.messages) ? body.messages : undefined,
        vehicle: body.vehicle,
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
                lane:
                  action.context?.lane === "parts_follow_up" ||
                  action.context?.lane === "low_inventory_reorder" ||
                  action.context?.lane === "fleet_follow_up" ||
                  action.context?.lane === "smart_match_readiness" ||
                  action.context?.lane === "menu_item_efficiency_review" ||
                  action.context?.lane ===
                    "inspection_template_efficiency_review" ||
                  action.context?.lane === "menu_item_draft" ||
                  action.context?.lane === "inspection_template_draft" ||
                  action.context?.lane === "service_bundle_draft"
                    ? action.context.lane
                    : undefined,
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
        ...answer.links.map((link) => ({
          label: link.label,
          href: link.href,
          type: "link",
        })),
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
        error: error instanceof Error ? error.message : "Assistant failed",
      },
      { status: 500 },
    );
  }
}
