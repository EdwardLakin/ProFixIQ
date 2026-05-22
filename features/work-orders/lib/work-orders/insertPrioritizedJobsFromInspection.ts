import "server-only";

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { estimateLabor } from "@ai/lib/ai/estimateLabor";
import { normalizeLaborHoursInput } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";

type DB = Database;

type InspectionRow = DB["public"]["Tables"]["inspections"]["Row"];
type WorkOrderLineInsert = DB["public"]["Tables"]["work_order_lines"]["Insert"];
type PartsRequestInsert = DB["public"]["Tables"]["parts_requests"]["Insert"];

type WorkOrderLineSourceInsert = WorkOrderLineInsert & {
  source_inspection_id: string;
  source_inspection_item_key: string;
};

type PartsRequestSourceInsert = PartsRequestInsert & {
  source_inspection_id: string;
  source_inspection_item_key: string;
};

type InspectionResult = {
  sections: Array<{
    title: string;
    items: Array<{
      name: string;
      label?: string;
      value?: string;
      unit?: string;
      notes?: string;
      status?: "ok" | "fail" | "na" | "recommend";
      recommend?: boolean;
    }>;
  }>;
};

export type ImportFromInspectionArgs = {
  supabase: SupabaseClient<DB>;
  inspectionId: string;
  workOrderId: string;
  vehicleId: string;
  userId: string;
  autoGenerateParts?: boolean;
};

export type ImportFromInspectionResult =
  | {
      ok: true;
      insertedCount: number;
      partsRequestsCount: number;
      skippedCount: number;
      skippedPartsRequestsCount: number;
    }
  | { ok: false; error: string };

function normalizeSourceComponent(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildInspectionSourceKey(args: {
  inspectionId: string;
  sectionIndex: number;
  itemIndex: number;
  sectionTitle?: string;
  itemName?: string;
  itemLabel?: string;
  unit?: string;
}): string {
  const normalizedSectionTitle = normalizeSourceComponent(args.sectionTitle);
  const normalizedItemName = normalizeSourceComponent(args.itemName || args.itemLabel);
  const normalizedUnit = normalizeSourceComponent(args.unit);
  const raw = `${args.inspectionId}|${args.sectionIndex}|${args.itemIndex}|${normalizedSectionTitle}|${normalizedItemName}|${normalizedUnit}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function normalizePartName(value: string | null | undefined): string {
  return normalizeSourceComponent(value);
}

export async function insertPrioritizedJobsFromInspection(
  args: ImportFromInspectionArgs,
): Promise<ImportFromInspectionResult> {
  const {
    supabase,
    inspectionId,
    workOrderId,
    vehicleId,
    userId,
    autoGenerateParts = true,
  } = args;

  const { data: inspection, error: inspErr } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle<InspectionRow>();

  if (inspErr) {
    return { ok: false, error: `Failed to fetch inspection: ${inspErr.message}` };
  }
  if (!inspection) {
    return { ok: false, error: "Inspection not found." };
  }

  if (!inspection.shop_id) {
    return { ok: false, error: "Inspection is missing shop_id." };
  }

  const shopId = inspection.shop_id;

  const result = (inspection as unknown as { result?: unknown })?.result as
    | InspectionResult
    | undefined;

  if (!result?.sections || !Array.isArray(result.sections)) {
    return { ok: false, error: "Invalid inspection format: missing sections." };
  }

  const diagnosisKeywords = ["check engine", "diagnose", "misfire", "no start"];
  const maintenanceKeywords = ["oil", "fluid", "filter", "belt", "coolant"];
  const autoPartsKeywords = [
    "brake",
    "pads",
    "rotor",
    "fluid",
    "coolant",
    "filter",
    "belt",
  ];

  const allJobs: WorkOrderLineSourceInsert[] = [];
  const jobItemMap: Array<{
    originalItem: InspectionResult["sections"][number]["items"][number];
    sourceKey: string;
  }> = [];

  for (const [sectionIndex, section] of result.sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      const itemName = item.name || item.label || "";
      const nameLower = itemName.toLowerCase();
      let jobType: WorkOrderLineInsert["job_type"] = "repair";

      if (diagnosisKeywords.some((k) => nameLower.includes(k))) jobType = "diagnosis";
      else if (item.status === "fail") jobType = "inspection-fail";
      else if (maintenanceKeywords.some((k) => nameLower.includes(k))) jobType = "maintenance";

      const shouldInclude =
        item.status === "fail" || item.recommend === true || jobType !== "repair";

      if (!shouldInclude) continue;

      const sourceKey = buildInspectionSourceKey({
        inspectionId,
        sectionIndex,
        itemIndex,
        sectionTitle: section.title,
        itemName: item.name,
        itemLabel: item.label,
        unit: item.unit,
      });

      const laborTime = normalizeLaborHoursInput(await estimateLabor(itemName, jobType), true);

      const complaintParts: string[] = [];
      if (itemName) complaintParts.push(itemName);
      if (item.value) complaintParts.push(`(${item.value}${item.unit || ""})`);
      if (item.notes) complaintParts.push(`- ${item.notes}`);

      const job: WorkOrderLineSourceInsert = {
        shop_id: shopId,
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: complaintParts.join(" "),
        status: "in_progress",
        job_type: jobType,
        punched_in_at: null,
        punched_out_at: null,
        hold_reason: null,
        assigned_tech_id: null,
        labor_time: laborTime,
        source_inspection_id: inspectionId,
        source_inspection_item_key: sourceKey,
      };

      allJobs.push(job);
      jobItemMap.push({ originalItem: item, sourceKey });
    }
  }

  if (allJobs.length === 0) {
    return { ok: true, insertedCount: 0, partsRequestsCount: 0, skippedCount: 0, skippedPartsRequestsCount: 0 };
  }

  const sourceKeys = allJobs.map((job) => job.source_inspection_item_key);

  const { data: existingActiveLines, error: existingLinesErr } = await supabase
    .from("work_order_lines")
    .select("id, source_inspection_item_key")
    .eq("work_order_id", workOrderId)
    .eq("source_inspection_id", inspectionId)
    .in("source_inspection_item_key", sourceKeys)
    .is("voided_at", null)
    .returns<Array<{ id: string; source_inspection_item_key: string | null }>>();

  if (existingLinesErr) {
    return {
      ok: false,
      error: `Error checking existing inspection lines: ${existingLinesErr.message}`,
    };
  }

  const existingKeySet = new Set(
    (existingActiveLines ?? [])
      .map((row) => row.source_inspection_item_key)
      .filter((key): key is string => Boolean(key)),
  );

  const jobsToInsert: WorkOrderLineSourceInsert[] = [];
  const jobItemMapToInsert: Array<{
    originalItem: InspectionResult["sections"][number]["items"][number];
    sourceKey: string;
  }> = [];

  for (let i = 0; i < allJobs.length; i++) {
    const sourceKey = allJobs[i].source_inspection_item_key;
    if (existingKeySet.has(sourceKey)) continue;
    jobsToInsert.push(allJobs[i]);
    jobItemMapToInsert.push(jobItemMap[i]);
  }

  const skippedCount = allJobs.length - jobsToInsert.length;

  if (jobsToInsert.length === 0) {
    return { ok: true, insertedCount: 0, partsRequestsCount: 0, skippedCount, skippedPartsRequestsCount: 0 };
  }

  const insertedJobsRes = await supabase
    .from("work_order_lines")
    .insert(jobsToInsert)
    .select("id, complaint, source_inspection_item_key");

  if (insertedJobsRes.error) {
    return {
      ok: false,
      error: `Error inserting job lines: ${insertedJobsRes.error.message}`,
    };
  }

  const insertedJobs = insertedJobsRes.data ?? [];
  let partsRequestsCount = 0;
  let skippedPartsRequestsCount = 0;

  if (autoGenerateParts && insertedJobs.length > 0) {
    const partsCandidates: PartsRequestSourceInsert[] = [];

    for (let i = 0; i < insertedJobs.length; i++) {
      const { complaint, id: jobId } = insertedJobs[i];
      const originalItem = jobItemMapToInsert[i]?.originalItem;
      const sourceKey = jobItemMapToInsert[i]?.sourceKey;

      const lower = (complaint ?? "").toLowerCase();
      const partName = originalItem?.name || originalItem?.label;
      if (!partName || !sourceKey) continue;

      if (autoPartsKeywords.some((k) => lower.includes(k))) {
        partsCandidates.push({
          id: crypto.randomUUID(),
          job_id: jobId,
          work_order_id: workOrderId,
          part_name: partName,
          quantity: 1,
          urgency: "medium",
          notes: "Auto-generated from inspection",
          photo_urls: [],
          requested_by: userId,
          created_at: new Date().toISOString(),
          viewed_at: null,
          fulfilled_at: null,
          archived: false,
          source_inspection_id: inspectionId,
          source_inspection_item_key: sourceKey,
        });
      }
    }

    if (partsCandidates.length > 0) {
      const sourceKeysForParts = [...new Set(partsCandidates.map((row) => row.source_inspection_item_key))];

      const { data: existingParts, error: existingPartsErr } = await supabase
        .from("parts_requests")
        .select("source_inspection_item_key, part_name")
        .eq("work_order_id", workOrderId)
        .eq("source_inspection_id", inspectionId)
        .in("source_inspection_item_key", sourceKeysForParts)
        .returns<Array<{ source_inspection_item_key: string | null; part_name: string | null }>>();

      if (existingPartsErr) {
        return {
          ok: false,
          error: `Error checking existing parts requests: ${existingPartsErr.message}`,
        };
      }

      const existingPartSet = new Set(
        (existingParts ?? [])
          .filter((row) => row.source_inspection_item_key)
          .map(
            (row) =>
              `${row.source_inspection_item_key}|${normalizePartName(row.part_name)}`,
          ),
      );

      const partsToInsert = partsCandidates.filter((row) => {
        const dedupeKey = `${row.source_inspection_item_key}|${normalizePartName(row.part_name)}`;
        if (existingPartSet.has(dedupeKey)) return false;
        existingPartSet.add(dedupeKey);
        return true;
      });

      skippedPartsRequestsCount = partsCandidates.length - partsToInsert.length;

      if (partsToInsert.length > 0) {
        const { error: partsErr } = await supabase
          .from("parts_requests")
          .insert(partsToInsert);

        if (!partsErr) {
          partsRequestsCount = partsToInsert.length;
        }
      }
    }
  }

  return {
    ok: true,
    insertedCount: insertedJobs.length,
    partsRequestsCount,
    skippedCount,
    skippedPartsRequestsCount,
  };
}
