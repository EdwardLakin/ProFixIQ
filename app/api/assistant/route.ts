// app/api/assistant/route.ts

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import {
  requireShopAssistantActor,
  resolveShopAssistantError,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import type {
  AssistantAskContext,
  AssistantAskSession,
  AssistantConversationMessage,
  AssistantVehicleContext,
} from "@/features/agent/assistant/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();
  let actor: Awaited<ReturnType<typeof requireShopAssistantActor>>;
  try {
    actor = await requireShopAssistantActor(supabase);
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(error, "legacy-assistant-auth");
    return NextResponse.json(
      { error: resolved.message },
      { status: resolved.status },
    );
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
      shopId: actor.shopId,
      userId: actor.userId,
      profileId: actor.profileId,
      role: actor.role,
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
      grounding: answer.grounding,
    });
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(error, "legacy-assistant");
    return NextResponse.json(
      {
        error: resolved.message,
      },
      { status: resolved.status },
    );
  }
}
