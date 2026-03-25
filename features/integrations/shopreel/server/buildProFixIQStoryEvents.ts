import crypto from "crypto";
import type { InspectionItem } from "@/features/inspections/lib/inspection/types";
import type { ProFixIQStoryEvent, ProFixIQStoryFinding, ProFixIQStoryService } from "../types";
import { createAdminClient } from "./createAdminClient";

type WorkOrderContext = {
  shopId: string;
  approvalStatus: "pending" | "approved" | "declined" | "deferred" | null;
  vehicleLabel: string | null;
  services: ProFixIQStoryService[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeApprovalStatus(
  value: string | null | undefined
): "pending" | "approved" | "declined" | "deferred" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();

  if (normalized === "approved") return "approved";
  if (normalized === "declined") return "declined";
  if (normalized === "deferred") return "deferred";
  if (normalized === "pending") return "pending";

  return null;
}

function normalizeFindingStatus(
  value: string | null | undefined
): "failed" | "recommended" | "pass" | "info" | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();

  if (["fail", "failed", "bad", "red"].includes(normalized)) return "failed";
  if (["recommend", "recommended", "advisory", "yellow"].includes(normalized)) return "recommended";
  if (["pass", "passed", "ok", "good", "green"].includes(normalized)) return "pass";
  if (["info", "note", "observed"].includes(normalized)) return "info";

  return undefined;
}

function extractFindings(results: InspectionItem[]): ProFixIQStoryFinding[] {
  const findings: ProFixIQStoryFinding[] = [];

  for (const item of results) {
    const record = isRecord(item) ? item : null;
    if (!record) continue;

    const label =
      readString(record, ["label", "title", "name", "item", "description"]) ?? "Inspection finding";

    const status = normalizeFindingStatus(
      readString(record, ["status", "result", "state", "condition"])
    );

    const category = readString(record, ["category", "group", "section"]);

    const finding: ProFixIQStoryFinding = {
      label,
      category,
    };

    if (status) {
      finding.status = status;
    }

    findings.push(finding);
  }

  return findings;
}

function summarizeFindings(findings: ProFixIQStoryFinding[]): string | null {
  if (!findings.length) return null;
  return findings
    .slice(0, 5)
    .map((finding) => {
      const prefix = finding.status ? `${finding.status.toUpperCase()}: ` : "";
      return `${prefix}${finding.label}`;
    })
    .join(" | ");
}

async function loadWorkOrderContext(workOrderId: string): Promise<WorkOrderContext | null> {
  const supabase = createAdminClient();

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id, approval_state")
    .eq("id", workOrderId)
    .maybeSingle<{
      id: string;
      shop_id: string | null;
      vehicle_id: string | null;
      approval_state: string | null;
    }>();

  if (workOrderError || !workOrder?.shop_id) {
    return null;
  }

  let vehicleLabel: string | null = null;

  if (workOrder.vehicle_id) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("year, make, model")
      .eq("id", workOrder.vehicle_id)
      .maybeSingle<{
        year: number | string | null;
        make: string | null;
        model: string | null;
      }>();

    const parts = [vehicle?.year, vehicle?.make, vehicle?.model]
      .map((value) => (value == null ? null : String(value).trim()))
      .filter((value): value is string => Boolean(value));

    vehicleLabel = parts.length ? parts.join(" ") : null;
  }

  const { data: lineRows } = await supabase
    .from("work_order_lines")
    .select("description, item, name, title")
    .eq("work_order_id", workOrderId)
    .returns<Array<{
      description: string | null;
      item: string | null;
      name: string | null;
      title: string | null;
    }>>();

  const services: ProFixIQStoryService[] = [];

  for (const line of lineRows ?? []) {
    const label =
      line.title?.trim() ||
      line.name?.trim() ||
      line.item?.trim() ||
      line.description?.trim() ||
      null;

    if (!label) continue;

    services.push({
      label,
      kind: "repair",
    });
  }

  return {
    shopId: workOrder.shop_id,
    approvalStatus: normalizeApprovalStatus(workOrder.approval_state),
    vehicleLabel,
    services,
  };
}

export async function buildInspectionCompletedEvent(args: {
  workOrderId: string;
  workOrderLineId: string;
  results: InspectionItem[];
  templateName?: string | null;
}): Promise<ProFixIQStoryEvent | null> {
  const context = await loadWorkOrderContext(args.workOrderId);
  if (!context) return null;

  const findings = extractFindings(args.results);
  const summary =
    summarizeFindings(findings) ??
    (args.templateName ? `Inspection completed for ${args.templateName}.` : "Inspection completed.");

  return {
    eventId: crypto.randomUUID(),
    eventType: "inspection.completed",
    occurredAt: new Date().toISOString(),
    source: {
      app: "profixiq",
      shopId: context.shopId,
      locationId: null,
    },
    subject: {
      workOrderId: args.workOrderId,
      workOrderNumber: null,
      inspectionId: null,
      vehicleId: null,
      customerLabel: "Customer",
      vehicleLabel: context.vehicleLabel,
    },
    storyData: {
      headline: args.templateName
        ? `${args.templateName} inspection completed`
        : "Inspection completed",
      summary,
      findings,
      services: context.services,
      media: [],
      approvalStatus: context.approvalStatus,
      technicianSummary: summary,
    },
    privacy: {
      containsSensitiveData: false,
      redactionsApplied: [],
    },
  };
}

export async function buildInspectionFlaggedEvent(args: {
  workOrderId: string;
  results: InspectionItem[];
}): Promise<ProFixIQStoryEvent | null> {
  const context = await loadWorkOrderContext(args.workOrderId);
  if (!context) return null;

  const findings = extractFindings(args.results).filter(
    (finding) => finding.status === "failed" || finding.status === "recommended"
  );

  if (!findings.length) {
    return null;
  }

  const summary =
    summarizeFindings(findings) ?? "Flagged findings were identified during inspection.";

  return {
    eventId: crypto.randomUUID(),
    eventType: "inspection.finding.flagged",
    occurredAt: new Date().toISOString(),
    source: {
      app: "profixiq",
      shopId: context.shopId,
      locationId: null,
    },
    subject: {
      workOrderId: args.workOrderId,
      workOrderNumber: null,
      inspectionId: null,
      vehicleId: null,
      customerLabel: "Customer",
      vehicleLabel: context.vehicleLabel,
    },
    storyData: {
      headline: "Flagged inspection findings identified",
      summary,
      findings,
      services: context.services,
      media: [],
      approvalStatus: context.approvalStatus,
      technicianSummary: summary,
    },
    privacy: {
      containsSensitiveData: false,
      redactionsApplied: [],
    },
  };
}

export async function buildWorkOrderApprovedEvent(
  workOrderId: string
): Promise<ProFixIQStoryEvent | null> {
  const context = await loadWorkOrderContext(workOrderId);
  if (!context) return null;

  return {
    eventId: crypto.randomUUID(),
    eventType: "workorder.approved",
    occurredAt: new Date().toISOString(),
    source: {
      app: "profixiq",
      shopId: context.shopId,
      locationId: null,
    },
    subject: {
      workOrderId,
      workOrderNumber: null,
      inspectionId: null,
      vehicleId: null,
      customerLabel: "Customer",
      vehicleLabel: context.vehicleLabel,
    },
    storyData: {
      headline: "Work order approved",
      summary: "Customer approved the recommended work.",
      findings: [],
      services: context.services,
      media: [],
      approvalStatus: "approved",
      technicianSummary: "Customer approval received.",
    },
    privacy: {
      containsSensitiveData: false,
      redactionsApplied: [],
    },
  };
}

export async function buildWorkOrderCompletedEvent(
  workOrderId: string
): Promise<ProFixIQStoryEvent | null> {
  const context = await loadWorkOrderContext(workOrderId);
  if (!context) return null;

  return {
    eventId: crypto.randomUUID(),
    eventType: "workorder.completed",
    occurredAt: new Date().toISOString(),
    source: {
      app: "profixiq",
      shopId: context.shopId,
      locationId: null,
    },
    subject: {
      workOrderId,
      workOrderNumber: null,
      inspectionId: null,
      vehicleId: null,
      customerLabel: "Customer",
      vehicleLabel: context.vehicleLabel,
    },
    storyData: {
      headline: "Work order completed",
      summary: "Repair work was completed and is ready to invoice.",
      findings: [],
      services: context.services,
      media: [],
      approvalStatus: context.approvalStatus,
      technicianSummary: "Repair completed and marked ready to invoice.",
    },
    privacy: {
      containsSensitiveData: false,
      redactionsApplied: [],
    },
  };
}


export async function buildInspectionMediaCapturedEvent(args: {
  shopId: string;
  inspectionId: string;
  workOrderId?: string | null;
  itemName?: string | null;
  notes?: string | null;
  mediaUrl: string;
  vehicleLabel?: string | null;
}): Promise<ProFixIQStoryEvent> {
  return {
    eventId: crypto.randomUUID(),
    eventType: "inspection.media.captured",
    occurredAt: new Date().toISOString(),
    source: {
      app: "profixiq",
      shopId: args.shopId,
      locationId: null,
    },
    subject: {
      workOrderId: args.workOrderId ?? null,
      workOrderNumber: null,
      inspectionId: args.inspectionId,
      vehicleId: null,
      customerLabel: "Customer",
      vehicleLabel: args.vehicleLabel ?? null,
    },
    storyData: {
      headline: args.itemName
        ? `Inspection media captured: ${args.itemName}`
        : "Inspection media captured",
      summary: args.notes?.trim() || "Inspection photo captured.",
      findings: [],
      services: args.itemName
        ? [
            {
              label: args.itemName,
              kind: "inspection",
            },
          ]
        : [],
      media: [
        {
          url: args.mediaUrl,
          kind: "image",
          role: "inspection",
          title: args.itemName ?? null,
        },
      ],
      approvalStatus: null,
      technicianSummary: args.notes?.trim() || null,
    },
    privacy: {
      containsSensitiveData: false,
      redactionsApplied: [],
    },
  };
}
