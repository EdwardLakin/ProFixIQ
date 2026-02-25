// features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts
// SERVER-SAFE canonical import-from-inspection implementation.
// - Uses a SupabaseClient passed in from the API route (no browser client)
// - Batch inserts work_order_lines
// - Optionally creates parts_requests
// - Uses AI labor estimate (estimateLabor)

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { estimateLabor } from "@ai/lib/ai/generateLaborTimeEstimate";

type DB = Database;

type InspectionRow = DB["public"]["Tables"]["inspections"]["Row"];
type WorkOrderLineInsert = DB["public"]["Tables"]["work_order_lines"]["Insert"];
type PartsRequestInsert = DB["public"]["Tables"]["parts_requests"]["Insert"];

type InspectionResult = {
  sections: Array<{
    title: string;
    items: Array<{
      name: string;
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
  | { ok: true; insertedCount: number; partsRequestsCount: number }
  | { ok: false; error: string };

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

  // 1) Load inspection
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

  // Some generated supabase types don't include `result` on inspections.Row.
  const result = (inspection as unknown as { result?: unknown })?.result as
    | InspectionResult
    | undefined;

  if (!result?.sections || !Array.isArray(result.sections)) {
    return { ok: false, error: "Invalid inspection format: missing sections." };
  }

  // 2) Build jobs
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

  const allJobs: WorkOrderLineInsert[] = [];
  const jobItemMap: Array<{
    originalItem: InspectionResult["sections"][number]["items"][number];
  }> = [];

  for (const section of result.sections) {
    for (const item of section.items) {
      const nameLower = (item.name ?? "").toLowerCase();
      let jobType: WorkOrderLineInsert["job_type"] = "repair";

      if (diagnosisKeywords.some((k) => nameLower.includes(k))) jobType = "diagnosis";
      else if (item.status === "fail") jobType = "inspection-fail";
      else if (maintenanceKeywords.some((k) => nameLower.includes(k))) jobType = "maintenance";

      const shouldInclude =
        item.status === "fail" || item.recommend === true || jobType !== "repair";

      if (!shouldInclude) continue;

      const laborTime = await estimateLabor(item.name, jobType);

      const complaintParts: string[] = [];
      if (item.name) complaintParts.push(item.name);
      if (item.value) complaintParts.push(`(${item.value}${item.unit || ""})`);
      if (item.notes) complaintParts.push(`- ${item.notes}`);

      const job: WorkOrderLineInsert = {
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: complaintParts.join(" "),
        status: "queued",
        job_type: jobType,
        punched_in_at: null,
        punched_out_at: null,
        hold_reason: null,
        assigned_tech_id: null,
        labor_time: laborTime ?? null,
      };

      allJobs.push(job);
      jobItemMap.push({ originalItem: item });
    }
  }

  if (allJobs.length === 0) {
    return { ok: true, insertedCount: 0, partsRequestsCount: 0 };
  }

  // 3) Insert jobs (batch)
  const insertedJobsRes = await supabase
    .from("work_order_lines")
    .insert(allJobs)
    .select("id, complaint");

  if (insertedJobsRes.error) {
    return {
      ok: false,
      error: `Error inserting job lines: ${insertedJobsRes.error.message}`,
    };
  }

  const insertedJobs = insertedJobsRes.data ?? [];
  let partsRequestsCount = 0;

  // 4) Optional parts_requests
  if (autoGenerateParts && insertedJobs.length > 0) {
    const partsRequests: PartsRequestInsert[] = [];

    for (let i = 0; i < insertedJobs.length; i++) {
      const { complaint, id: jobId } = insertedJobs[i];
      const originalItem = jobItemMap[i]?.originalItem;

      const lower = (complaint ?? "").toLowerCase();
      if (!originalItem?.name) continue;

      if (autoPartsKeywords.some((k) => lower.includes(k))) {
        partsRequests.push({
          id: crypto.randomUUID(),
          job_id: jobId,
          work_order_id: workOrderId,
          part_name: originalItem.name,
          quantity: 1,
          urgency: "medium",
          notes: "Auto-generated from inspection",
          photo_urls: [],
          requested_by: userId,
          created_at: new Date().toISOString(),
          viewed_at: null,
          fulfilled_at: null,
          archived: false,
        });
      }
    }

    if (partsRequests.length > 0) {
      const { error: partsErr } = await supabase
        .from("parts_requests")
        .insert(partsRequests);

      if (!partsErr) {
        partsRequestsCount = partsRequests.length;
      }
      // non-fatal if parts insert fails
    }
  }

  return {
    ok: true,
    insertedCount: insertedJobs.length,
    partsRequestsCount,
  };
}