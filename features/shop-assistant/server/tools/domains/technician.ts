import "server-only";

import { z } from "zod";

import { runTechnicianCopilotTurn } from "@/features/copilot/technician/server/chat";
import { technicianWorkLineLabel } from "@/features/copilot/technician/server/actions";
import { listTechnicianWorkCandidates } from "@/features/copilot/technician/server/assignedWork";
import { requireTechnicianCopilotAccess } from "@/features/copilot/technician/server/auth";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { defineShopAssistantTool } from "../types";

const AssignedLineSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  status: z.string(),
  holdReason: z.string().nullable(),
});

const AssignedWorkSchema = z.object({
  workOrderId: z.string().uuid(),
  customId: z.string().nullable(),
  status: z.string().nullable(),
  vehicle: z.string().nullable(),
  lines: z.array(AssignedLineSchema),
  href: z.string(),
});

const CopilotResultSchema = z.object({
  ok: z.literal(true),
  reply: z.string(),
  sessionId: z.string().uuid().nullable(),
  workOrderId: z.string().uuid().nullable(),
  summary: z.string(),
  href: z.string(),
});

function vehicleLabel(candidate: {
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleUnitNumber: string | null;
}): string | null {
  const description = [
    candidate.vehicleYear,
    candidate.vehicleMake,
    candidate.vehicleModel,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    [candidate.vehicleUnitNumber, description].filter(Boolean).join(" • ") ||
    null
  );
}

function idsIn(value: string): string[] {
  return [
    ...new Set(
      Array.from(
        value.matchAll(
          /\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/gi,
        ),
        (match) => match[1].toLowerCase(),
      ),
    ),
  ];
}

function oneTargetId(
  targetVersions: Record<string, string> | undefined,
  prefix: string,
): string | null {
  const matches = Object.keys(targetVersions ?? {})
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
  return matches.length === 1 ? matches[0] : null;
}

export const listMyAssignedWorkTool = defineShopAssistantTool({
  name: "list_my_assigned_work",
  domain: "technician",
  description:
    "List only the signed-in mechanic's canonically assigned, active job lines.",
  mode: "read",
  risk: "low",
  requiredCapability: "canPerformAssignedWork",
  allowedRoles: ["mechanic"],
  confirmation: "never",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).default(20),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    workOrders: z.array(AssignedWorkSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const assigned = await listTechnicianWorkCandidates({
      supabase: createAdminSupabase(),
      shopId: context.actor.shopId,
      technicianIds: [context.actor.userId, context.actor.profileId],
    });
    const workOrders = assigned.slice(0, input.limit).map((candidate) => ({
      workOrderId: candidate.id,
      customId: candidate.customId,
      status: candidate.status,
      vehicle: vehicleLabel(candidate),
      lines: candidate.lines.map((line) => ({
        id: line.id,
        label: technicianWorkLineLabel(line),
        status: line.status,
        holdReason: line.holdReason,
      })),
      href: `/work-orders/${candidate.id}`,
    }));
    const lineCount = workOrders.reduce(
      (sum, workOrder) => sum + workOrder.lines.length,
      0,
    );
    return {
      ok: true as const,
      workOrders,
      summary: `${lineCount} active job line(s) across ${workOrders.length} assigned work order(s).`,
      href: "/mobile",
    };
  },
});

export const requestTechnicianCopilotTool = defineShopAssistantTool({
  name: "request_technician_copilot",
  domain: "technician",
  description:
    "Send one confirmed mechanic request through the canonical Technician CoPilot, which remains bound to assigned work and may safely start, hold, release, document, or complete an unambiguous job.",
  mode: "write",
  risk: "high",
  requiredCapability: "canPerformAssignedWork",
  allowedRoles: ["mechanic"],
  confirmation: "required",
  inputSchema: z.object({
    message: z.string().trim().min(1).max(4000),
    workOrderId: z.string().uuid().optional(),
    workOrderLineId: z.string().uuid().optional(),
  }),
  outputSchema: CopilotResultSchema,
  async authorize(_input, context) {
    const access = await requireTechnicianCopilotAccess();
    if (
      access.authUserId !== context.actor.userId ||
      access.profileId !== context.actor.profileId ||
      access.shopId !== context.actor.shopId
    ) {
      throw new Error(
        "Technician CoPilot identity does not match this assistant actor.",
      );
    }
  },
  async preview(input, context) {
    const candidates = await listTechnicianWorkCandidates({
      supabase: createAdminSupabase(),
      shopId: context.actor.shopId,
      technicianIds: [context.actor.userId, context.actor.profileId],
    });
    const mentionedIds = new Set(idsIn(input.message));
    const matchingCandidates = candidates.filter(
      (candidate) =>
        candidate.id === input.workOrderId || mentionedIds.has(candidate.id),
    );
    const workOrder = input.workOrderId
      ? (matchingCandidates[0] ?? null)
      : matchingCandidates.length === 1
        ? matchingCandidates[0]
        : candidates.length === 1
          ? candidates[0]
          : null;
    if (!workOrder) {
      throw new ShopAssistantHttpError(
        409,
        candidates.length === 0
          ? "No assigned, actionable work order is available."
          : "More than one assigned work order is active. Specify the work order before confirming a job action.",
      );
    }

    const matchingLines = workOrder.lines.filter(
      (line) => line.id === input.workOrderLineId || mentionedIds.has(line.id),
    );
    const line = input.workOrderLineId
      ? (matchingLines[0] ?? null)
      : matchingLines.length === 1
        ? matchingLines[0]
        : workOrder.lines.length === 1
          ? workOrder.lines[0]
          : null;
    if (!line) {
      throw new ShopAssistantHttpError(
        409,
        "More than one assigned job line is actionable. Specify the exact job before confirming this request.",
      );
    }

    const workOrderLabel = workOrder.customId
      ? `WO #${workOrder.customId}`
      : `WO ${workOrder.id.slice(0, 8)}`;
    return {
      title: `Run Technician CoPilot on ${workOrderLabel}`,
      summary: `${technicianWorkLineLabel(line)} — ${input.message}`,
      consequences: [
        `The request is bound to ${workOrderLabel}, job ${line.id.slice(0, 8)}.`,
        "If the request clearly asks to start, hold, release, document, or complete a job, the canonical idempotent technician action may run.",
        "If that assignment or job version changes before execution, the action will stop for a new review.",
      ],
      targetVersions: {
        [`technician_work_order:${workOrder.id}`]: "confirmed",
        [`technician_work_order_line:${line.id}`]: line.updatedAt ?? "missing",
      },
      metadata: {
        source: "shop_assistant",
        workOrderId: workOrder.id,
        workOrderLineId: line.id,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required for a Technician CoPilot request.",
      );
    }
    const access = await requireTechnicianCopilotAccess();
    if (
      access.authUserId !== context.actor.userId ||
      access.profileId !== context.actor.profileId ||
      access.shopId !== context.actor.shopId
    ) {
      throw new Error(
        "Technician CoPilot identity does not match this assistant actor.",
      );
    }
    const workOrderId = oneTargetId(
      context.targetVersions,
      "technician_work_order:",
    );
    const workOrderLineId = oneTargetId(
      context.targetVersions,
      "technician_work_order_line:",
    );
    if (!workOrderId || !workOrderLineId) {
      throw new ShopAssistantHttpError(
        409,
        "The confirmed technician target is unavailable. Ask again to review the current assigned job.",
      );
    }
    const expectedLineVersion =
      context.targetVersions?.[
        `technician_work_order_line:${workOrderLineId}`
      ] ?? "";
    if (!expectedLineVersion) {
      throw new ShopAssistantHttpError(
        409,
        "The confirmed technician job version is unavailable. Ask again to review its current state.",
      );
    }
    const result = await runTechnicianCopilotTurn({
      identity: {
        authUserId: access.authUserId,
        profileId: access.profileId,
        shopId: access.shopId,
        documentationEnabled: access.capabilities.documentation,
        voiceEnabled: access.capabilities.voice,
        supabase: createAdminSupabase(),
      },
      message: input.message,
      turnId: context.actionId,
      sessionId: null,
      inputSource: "ui",
      requiredWorkOrderId: workOrderId,
      requiredWorkOrderLineId: workOrderLineId,
      requiredWorkOrderLineUpdatedAt: expectedLineVersion,
    });
    return {
      ok: true as const,
      reply: result.reply,
      sessionId: result.sessionId ?? null,
      workOrderId,
      summary: result.reply,
      href: `/work-orders/${workOrderId}`,
    };
  },
});
