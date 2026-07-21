import { z } from "zod";
import type {
  AssistantEntity,
  AssistantExecutionResult,
} from "@/features/agent/assistant/types";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import type { Json } from "@shared/types/types/supabase";
import type { ShopAssistantSupabaseClient } from "./shopAssistantDatabase";

const SetWorkOrderHoldInput = z.object({
  workOrderReference: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(3).max(240),
});

function asRecord(value: Json | null): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function stringValue(
  record: Record<string, Json | undefined>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberValue(
  record: Record<string, Json | undefined>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function executeShopAssistantAction(params: {
  client: ShopAssistantSupabaseClient;
  actionId: string;
  shopId: string;
  profileId: string;
  role: string | null;
  toolName: string;
  input: Json;
}): Promise<AssistantExecutionResult> {
  const actor = getActorCapabilities({ role: params.role });

  if (params.toolName === "set_work_order_hold") {
    if (!actor.canManageWorkOrders) {
      throw new Error("Your role cannot place shop work orders on hold.");
    }

    const input = SetWorkOrderHoldInput.parse(params.input);
    const { data, error } = await params.client.rpc(
      "assistant_set_work_order_hold",
      {
        p_shop_id: params.shopId,
        p_actor_profile_id: params.profileId,
        p_work_order_reference: input.workOrderReference,
        p_reason: input.reason,
      },
    );

    if (error) throw new Error(error.message);

    const result = asRecord(data);
    const workOrderId = stringValue(result, "work_order_id");
    const reference =
      stringValue(result, "work_order_reference") ?? input.workOrderReference;
    const affectedLineCount = numberValue(result, "affected_line_count") ?? 0;
    const affectedRecords: AssistantEntity[] = workOrderId
      ? [
          {
            type: "work_order",
            id: workOrderId,
            label: `WO #${reference}`,
            href: `/work-orders/${workOrderId}`,
          },
        ]
      : [];

    return {
      actionId: params.actionId,
      toolName: params.toolName,
      status: "succeeded",
      summary: `WO #${reference} is now on hold for ${input.reason.toLowerCase()}.`,
      details: [
        `${affectedLineCount} active line${affectedLineCount === 1 ? " was" : "s were"} placed on hold.`,
        "The change was recorded in the shop audit log.",
      ],
      affectedRecords,
    };
  }

  throw new Error(`Unsupported assistant tool: ${params.toolName}`);
}
