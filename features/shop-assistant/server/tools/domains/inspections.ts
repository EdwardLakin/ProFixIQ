import "server-only";

import { z } from "zod";

import { listTechnicianWorkCandidates } from "@/features/copilot/technician/server/assignedWork";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { resolveCurrentWorkspaceCapabilities } from "@/features/workspace/authorization/server/resolveWorkspaceCapabilities";
import { defineShopAssistantTool, runShopAssistantCommandRpc } from "../types";

const InspectionSchema = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid().nullable(),
  workOrderLineId: z.string().uuid().nullable(),
  status: z.string().nullable(),
  completed: z.boolean(),
  locked: z.boolean(),
  finalizedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  href: z.string(),
});

const ReopenInspectionResultSchema = z.object({
  ok: z.literal(true),
  inspectionId: z.string().uuid(),
  alreadyOpen: z.boolean(),
  reopenedAt: z.string().nullable(),
  signingCycle: z.number().int().nonnegative(),
  summary: z.string(),
  href: z.string(),
});

type ReopenInspectionRow = {
  id: string;
  work_order_id: string | null;
  status: string | null;
  completed: boolean | null;
  locked: boolean | null;
  is_draft: boolean | null;
  finalized_at: string | null;
  finalized_by: string | null;
  signing_cycle: number | null;
  updated_at: string | null;
};

function inspectionIsOpen(row: ReopenInspectionRow): boolean {
  return (
    !row.locked &&
    !row.completed &&
    row.is_draft !== false &&
    !row.finalized_at &&
    !row.finalized_by &&
    !["completed", "finalized", "signed"].includes(
      String(row.status ?? "draft").toLowerCase(),
    )
  );
}

function inspectionTargetVersions(
  row: ReopenInspectionRow,
): Record<string, string> {
  return {
    [`inspection:${row.id}`]: row.updated_at ?? "missing",
    [`inspection_signing_cycle:${row.id}`]: String(row.signing_cycle ?? 0),
    [`inspection_locked:${row.id}`]: String(Boolean(row.locked)),
    [`inspection_completed:${row.id}`]: String(Boolean(row.completed)),
    [`inspection_is_draft:${row.id}`]: String(row.is_draft !== false),
    [`inspection_status:${row.id}`]: JSON.stringify(row.status ?? null),
    [`inspection_finalized_at:${row.id}`]: row.finalized_at ?? "missing",
    [`inspection_finalized_by:${row.id}`]: row.finalized_by ?? "missing",
  };
}

export const listInspectionsTool = defineShopAssistantTool({
  name: "list_inspections",
  domain: "inspections",
  description:
    "List inspection lifecycle records without entering technician diagnostic mode.",
  mode: "read",
  risk: "low",
  requiredCapability: "canRunInspections",
  confirmation: "never",
  inputSchema: z.object({
    workOrderId: z.string().uuid().optional(),
    status: z.string().optional(),
    onlyOpen: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    inspections: z.array(InspectionSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    let mechanicWorkOrderIds: string[] | null = null;
    if (context.actor.canonicalRole === "mechanic") {
      const assigned = await listTechnicianWorkCandidates({
        supabase: createAdminSupabase(),
        shopId: context.actor.shopId,
        technicianIds: [context.actor.userId, context.actor.profileId],
      });
      mechanicWorkOrderIds = assigned.map((candidate) => candidate.id);
      if (
        input.workOrderId &&
        !mechanicWorkOrderIds.includes(input.workOrderId)
      ) {
        throw new ShopAssistantHttpError(
          403,
          "This inspection does not belong to your assigned work.",
        );
      }
      if (mechanicWorkOrderIds.length === 0) {
        return {
          ok: true as const,
          inspections: [],
          summary:
            "No inspection records are attached to your active assigned work.",
          href: "/inspection/saved",
        };
      }
    }

    const readClient = mechanicWorkOrderIds
      ? createAdminSupabase()
      : context.actor.supabase;
    let query = readClient
      .from("inspections")
      .select(
        "id, work_order_id, work_order_line_id, status, completed, locked, finalized_at, updated_at",
      )
      .eq("shop_id", context.actor.shopId)
      .eq("is_canonical", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(input.limit);
    if (input.workOrderId) query = query.eq("work_order_id", input.workOrderId);
    if (!input.workOrderId && mechanicWorkOrderIds) {
      query = query.in("work_order_id", mechanicWorkOrderIds);
    }
    if (input.status) query = query.eq("status", input.status);
    if (input.onlyOpen) query = query.eq("completed", false);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const inspections = (data ?? []).map((row) => ({
      id: row.id,
      workOrderId: row.work_order_id ?? null,
      workOrderLineId: row.work_order_line_id ?? null,
      status: row.status ?? null,
      completed: Boolean(row.completed),
      locked: Boolean(row.locked),
      finalizedAt: row.finalized_at ?? null,
      updatedAt: row.updated_at ?? null,
      href: row.work_order_id
        ? `/work-orders/${row.work_order_id}`
        : "/inspection/saved",
    }));

    return {
      ok: true as const,
      inspections,
      summary: `${inspections.length} inspection record(s) matched.`,
      href: "/inspection/saved",
    };
  },
});

export const reopenInspectionTool = defineShopAssistantTool({
  name: "reopen_inspection",
  domain: "inspections",
  description:
    "Reopen a finalized canonical inspection for an audited correction cycle. Owner, admin, manager, or advisor only.",
  mode: "write",
  risk: "high",
  allowedRoles: ["owner", "admin", "manager", "advisor"],
  confirmation: "required",
  inputSchema: z.object({
    inspectionId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1000),
  }),
  outputSchema: ReopenInspectionResultSchema,
  async authorize(_input, context) {
    const access = await resolveCurrentWorkspaceCapabilities({
      supabase: context.actor.supabase,
      profileId: context.actor.profileId,
      shopId: context.actor.shopId,
      capabilityKeys: [WORKSPACE_CAPABILITIES.runWorkOrderInspections],
    });
    if (
      access.error ||
      !access.capabilities[WORKSPACE_CAPABILITIES.runWorkOrderInspections]
        .granted
    ) {
      throw new ShopAssistantHttpError(
        403,
        "Inspection capability is required to reopen inspections.",
      );
    }
  },
  async preview(input, context) {
    const { data, error } = await createAdminSupabase()
      .from("inspections")
      .select(
        "id, work_order_id, status, completed, locked, is_draft, finalized_at, finalized_by, signing_cycle, updated_at",
      )
      .eq("shop_id", context.actor.shopId)
      .eq("id", input.inspectionId)
      .eq("is_canonical", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new ShopAssistantHttpError(
        404,
        "Canonical inspection not found in this shop.",
      );
    }
    const inspection = data as ReopenInspectionRow;
    if (inspectionIsOpen(inspection)) {
      throw new ShopAssistantHttpError(409, "This inspection is already open.");
    }
    return {
      title: "Reopen finalized inspection",
      summary: `Start a new correction cycle for: ${input.reason}`,
      consequences: [
        "The inspection becomes editable and returns to in progress.",
        "Finalization and signatures from the earlier cycle remain auditable but no longer authorize the reopened draft.",
        "The inspection must be reviewed, finalized, and signed again.",
      ],
      targetVersions: inspectionTargetVersions(inspection),
      metadata: { workOrderId: data.work_order_id, reason: input.reason },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required to reopen an inspection.");
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_reopen_inspection_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_inspection_id: input.inspectionId,
        p_reason: input.reason,
      },
    );
    return ReopenInspectionResultSchema.parse(data);
  },
});
