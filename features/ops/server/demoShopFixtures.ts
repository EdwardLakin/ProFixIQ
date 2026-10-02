import "server-only";

import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

// Populates a freshly cloned demo-prospect shop with the same baseline
// fixture content scripts/seed-demo-shop.mjs seeds into the template demo
// shop (same customers, vehicles, work orders, lines, and inspections), but
// attributed entirely to the prospect's own owner profile instead of the
// template's shared staff personas (admin@demo.profixiq.local etc.). Those
// personas are each pinned to a single shop_id (scripts/seed-demo-shop.mjs
// refuses to seed one into any shop but its own), so they can't be reused
// across per-prospect shops; re-provisioning a fresh persona set per
// prospect was considered and intentionally deferred (see PR discussion).
//
// Technician-family fields (work_orders.assigned_tech and the canonical
// work_order_lines technician assignment, via
// mutate_work_order_line_assignment_atomic) are left unassigned here: that
// RPC requires the assignee to already hold a technician-family role
// (mechanic/tech/foreman/lead hand), which a role='owner' prospect profile
// never has. This exercises the same "no valid technician persona
// available -> leave unassigned" fallback the template-shop seed script
// already has for missing personas, not new behavior.

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

const COMPLETED_LINE_STATUSES = new Set(["completed", "done", "closed", "invoiced"]);
const COMPLETED_INSPECTION_STATUSES = new Set(["completed", "done", "closed", "submitted"]);
const VALID_LINE_STATUSES = new Set([
  "awaiting",
  "awaiting_approval",
  "active",
  "on_hold",
  "completed",
  "invoiced",
]);
const VALID_LINE_APPROVAL_STATES = new Set(["pending", "approved", "declined"]);
const VALID_LINE_JOB_TYPES = new Set(["diagnosis", "inspection", "maintenance", "repair", "tech-suggested"]);
const VALID_LINE_TYPES = new Set(["job", "info"]);
const DEMO_LABOR_RATE = 145;

function normalizeLineStatus(status: unknown): string {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

function validateWorkOrderLineCompletedConstraint(line: {
  description: string;
  line_status: string | null;
  status: string;
  assigned_tech_id?: string | null;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
  completed_at?: string | null;
}): void {
  const normalizedStatus = normalizeLineStatus(line.line_status ?? line.status);
  if (!COMPLETED_LINE_STATUSES.has(normalizedStatus)) return;

  const requiredCompletedFields = ["assigned_tech_id", "punched_in_at", "punched_out_at", "completed_at"] as const;
  const missing = requiredCompletedFields.filter((field) => !line[field]);
  if (missing.length > 0) {
    throw new Error(
      `work_order_line_preflight failed: description="${line.description}" status=${normalizedStatus} missing completed fields: ${missing.join(", ")}`,
    );
  }
}

function validateSeededWorkOrderLineFields(line: {
  description: string;
  status: string;
  line_status: string | null;
  approval_state: string | null;
  job_type: string | null;
  line_type: string | null;
}): void {
  const descriptor = line.description ?? "(no description)";

  if (!VALID_LINE_STATUSES.has(line.status)) {
    throw new Error(
      `work_order_line_preflight failed: description="${descriptor}" invalid status="${line.status}" allowed=[${Array.from(VALID_LINE_STATUSES).join(", ")}]`,
    );
  }
  if (line.line_status !== null && line.line_status !== undefined && !VALID_LINE_STATUSES.has(line.line_status)) {
    throw new Error(
      `work_order_line_preflight failed: description="${descriptor}" invalid line_status="${line.line_status}" allowed=[${Array.from(VALID_LINE_STATUSES).join(", ")}]`,
    );
  }
  if (
    line.approval_state !== null &&
    line.approval_state !== undefined &&
    !VALID_LINE_APPROVAL_STATES.has(line.approval_state)
  ) {
    throw new Error(
      `work_order_line_preflight failed: description="${descriptor}" invalid approval_state="${line.approval_state}" allowed=[${Array.from(VALID_LINE_APPROVAL_STATES).join(", ")}]`,
    );
  }
  if (line.job_type !== null && line.job_type !== undefined && !VALID_LINE_JOB_TYPES.has(line.job_type)) {
    throw new Error(
      `work_order_line_preflight failed: description="${descriptor}" invalid job_type="${line.job_type}" allowed=[${Array.from(VALID_LINE_JOB_TYPES).join(", ")}]`,
    );
  }
  if (line.line_type !== null && line.line_type !== undefined && !VALID_LINE_TYPES.has(line.line_type)) {
    throw new Error(
      `work_order_line_preflight failed: description="${descriptor}" invalid line_type="${line.line_type}" allowed=[${Array.from(VALID_LINE_TYPES).join(", ")}]`,
    );
  }
}

function normalizeInspectionStatus(status: unknown): string {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

function isCompletedLikeInspection(inspection: { completed?: boolean; status: string }): boolean {
  const normalizedStatus = normalizeInspectionStatus(inspection.status);
  return Boolean(inspection.completed) || COMPLETED_INSPECTION_STATUSES.has(normalizedStatus);
}

function validateInspectionCompletedConstraint(inspection: {
  work_order_id: string;
  inspection_type: string;
  status: string;
  completed: boolean;
  is_draft: boolean;
  summary: unknown;
}): void {
  if (!isCompletedLikeInspection(inspection)) return;

  const normalizedStatus = normalizeInspectionStatus(inspection.status);
  const missing: string[] = [];
  if (normalizedStatus !== "completed") missing.push("status=completed");
  if (inspection.completed !== true) missing.push("completed=true");
  if (inspection.is_draft !== false) missing.push("is_draft=false");
  if (!inspection.summary || typeof inspection.summary !== "object") missing.push("summary(jsonb)");

  if (missing.length > 0) {
    throw new Error(
      `inspection_preflight failed: work_order_id=${inspection.work_order_id} inspection_type=${inspection.inspection_type} missing completed-state requirements: ${missing.join(", ")}`,
    );
  }
}

async function upsertByNaturalKey(args: {
  admin: AdminSupabase;
  table: string;
  match: Record<string, string>;
  payload: Record<string, unknown>;
}): Promise<{ id: string }> {
  const { admin, table, match, payload } = args;
  let query = admin.from(table).select("id").limit(1);
  for (const [key, value] of Object.entries(match)) query = query.eq(key, value);
  const { data: existing, error: lookupError } = await query.maybeSingle<{ id: string }>();
  if (lookupError) {
    throw new Error(`lookup failed (table=${table} match=${JSON.stringify(match)}): ${lookupError.message}`);
  }

  if (existing?.id) {
    const { error } = await admin.from(table).update(payload).eq("id", existing.id);
    if (error) throw new Error(`update failed (table=${table} id=${existing.id}): ${error.message}`);
    return { id: existing.id };
  }

  const { data: inserted, error: insertError } = await admin
    .from(table)
    .insert(payload)
    .select("id")
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (insertError) {
    throw new Error(`insert failed (table=${table} match=${JSON.stringify(match)}): ${insertError.message}`);
  }
  if (!inserted?.id) throw new Error(`insert returned no id (table=${table} match=${JSON.stringify(match)})`);
  return { id: inserted.id };
}

export type DemoShopFixtureCounts = {
  customerCount: number;
  vehicleCount: number;
  workOrderCount: number;
  workOrderLineCount: number;
  inspectionCount: number;
};

/**
 * Seeds the standard demo baseline (3 customers, 10 vehicles, 7 work
 * orders + their lines, 2 inspections) into shopId, with every actor field
 * pointed at actorProfileId. Idempotent (natural-key upsert), matching
 * scripts/seed-demo-shop.mjs's pattern, though a freshly cloned prospect
 * shop never has prior rows to reconcile against.
 */
export async function seedDemoShopFixtures(args: {
  admin: AdminSupabase;
  shopId: string;
  actorProfileId: string;
}): Promise<DemoShopFixtureCounts> {
  const { admin, shopId, actorProfileId } = args;

  const customers: Array<[name: string, type: string, email: string, phone: string]> = [
    ["North Ridge Logistics Ltd.", "fleet", "dispatch@northridge.demo.profixiq.local", "+1-555-010-2001"],
    ["Foothills Municipal Services", "fleet", "fleetdesk@foothills.demo.profixiq.local", "+1-555-010-2002"],
    ["Summit Construction Services", "commercial", "ops@summit.demo.profixiq.local", "+1-555-010-2003"],
  ];

  const customerIds: Record<string, string> = {};
  for (const [name, type, email, phone] of customers) {
    const customer = await upsertByNaturalKey({
      admin,
      table: "customers",
      match: { shop_id: shopId, email },
      payload: {
        shop_id: shopId,
        name,
        email,
        phone,
        notes: `Demo ${type} account`,
        city: "Calgary",
        province: "AB",
        postal_code: "T2P 0A1",
      },
    });
    customerIds[name] = customer.id;
  }

  const assets: Array<
    [unit: string, year: number, make: string, model: string, vin: string, plate: string, customerKey: string]
  > = [
    ["TR-101", 2022, "Freightliner", "Cascadia", "1DEMOTRAC00000001", "AB-D101", "north"],
    ["TR-102", 2021, "Kenworth", "T680", "1DEMOTRAC00000002", "AB-D102", "north"],
    ["TR-103", 2020, "Peterbilt", "579", "1DEMOTRAC00000003", "AB-D103", "summit"],
    ["TR-104", 2019, "Volvo", "VNL", "1DEMOTRAC00000004", "AB-D104", "north"],
    ["TL-201", 2018, "Great Dane", "Reefer", "1DEMOTRLR00000001", "AB-T201", "north"],
    ["TL-202", 2017, "Utility", "Dry Van", "1DEMOTRLR00000002", "AB-T202", "foothills"],
    ["TL-203", 2019, "Manac", "Flatbed", "1DEMOTRLR00000003", "AB-T203", "summit"],
    ["SV-301", 2023, "Ford", "F-550 Service", "1DEMOSRVC00000001", "AB-S301", "summit"],
    ["MU-401", 2022, "International", "HV607", "1DEMOMUNI00000001", "AB-M401", "foothills"],
    ["MU-402", 2021, "Mack", "LR", "1DEMOMUNI00000002", "AB-M402", "foothills"],
  ];

  const customerMap: Record<string, string> = {
    north: "North Ridge Logistics Ltd.",
    foothills: "Foothills Municipal Services",
    summit: "Summit Construction Services",
  };

  const vehicleIds: Record<string, string> = {};
  const vehicleCustomerIds: Record<string, string> = {};
  let vehicleIndex = 0;
  for (const [unit, year, make, model, vin, plate, customerKey] of assets) {
    const customerName = customerMap[customerKey];
    const vehicle = await upsertByNaturalKey({
      admin,
      table: "vehicles",
      match: { shop_id: shopId, unit_number: unit },
      payload: {
        shop_id: shopId,
        customer_id: customerIds[customerName],
        unit_number: unit,
        year,
        make,
        model,
        vin,
        license_plate: plate,
        mileage: String(120000 + vehicleIndex * 8500),
        engine_hours: 2500 + vehicleIndex * 175,
      },
    });
    vehicleIds[unit] = vehicle.id;
    vehicleCustomerIds[unit] = customerIds[customerName];
    vehicleIndex += 1;
  }

  const workOrders: Array<
    [customId: string, unit: string, status: string, notes: string, approvalState: string]
  > = [
    ["DEMO-WO-1001", "TR-101", "new", "Routine PM and brake noise check", "pending"],
    ["DEMO-WO-1002", "TR-102", "in_progress", "Coolant leak diagnostics", "pending"],
    ["DEMO-WO-1003", "TR-103", "awaiting_approval", "Front suspension rebuild quote", "pending"],
    ["DEMO-WO-1004", "TL-202", "awaiting", "ABS fault, waiting for parts", "pending"],
    ["DEMO-WO-1005", "SV-301", "queued", "Hydraulic line replacement", "approved"],
    ["DEMO-WO-1006", "MU-401", "completed", "Annual municipal safety inspection", "approved"],
    ["DEMO-WO-1007", "TR-101", "completed", "Repeat wheel-seal and brake contamination", "approved"],
  ];

  const workOrderIds: Record<string, string> = {};
  for (const [customId, unit, status, notes, approvalState] of workOrders) {
    const vehicleId = vehicleIds[unit];
    const vehicleCustomerId = vehicleCustomerIds[unit];
    if (!vehicleId || !vehicleCustomerId) {
      throw new Error(`work_order_preflight failed: ${customId} references missing seeded vehicle for unit ${unit}`);
    }

    const wo = await upsertByNaturalKey({
      admin,
      table: "work_orders",
      match: { shop_id: shopId, custom_id: customId },
      payload: {
        shop_id: shopId,
        user_id: actorProfileId,
        // No technician-family role exists in a single-owner prospect shop
        // (see module header); leave the generic assignment column null
        // rather than point it at a non-technician owner.
        assigned_tech: null,
        vehicle_id: vehicleId,
        customer_id: vehicleCustomerId,
        custom_id: customId,
        status,
        type: "repair",
        notes,
        approval_state: approvalState,
      },
    });
    workOrderIds[customId] = wo.id;
  }

  type SeedLine = {
    woNumber: string;
    description: string;
    complaint: string;
    cause: string;
    correction: string;
    approval_state: string | null;
    status: string;
    labor_time: number;
    job_type: string;
    parts_required: Array<{ part: string; qty: number }>;
    hold_reason?: string;
  };

  const lines: SeedLine[] = [
    {
      woNumber: "DEMO-WO-1001",
      description: "Brake pull and noise verification from inspection findings",
      complaint: "Driver reports brake pull and scraping noise under light pedal.",
      cause: "Inspection found uneven front pad wear and rotor hot spotting.",
      correction: "Recommend front brake service and rotor resurfacing.",
      approval_state: "approved",
      status: "active",
      labor_time: 1.2,
      job_type: "inspection",
      parts_required: [{ part: "Front pad set", qty: 1 }],
    },
    {
      woNumber: "DEMO-WO-1002",
      description: "Pressure test and leak trace",
      complaint: "Coolant level drops between shifts.",
      cause: "Pressure test shows seepage at upper radiator hose clamp.",
      correction: "Replace clamp and retest cooling system.",
      approval_state: null,
      status: "active",
      labor_time: 1.5,
      job_type: "diagnosis",
      parts_required: [{ part: "Stainless hose clamp", qty: 1 }],
    },
    {
      woNumber: "DEMO-WO-1003",
      description: "Approved steering link replacement",
      complaint: "Front end wander and looseness.",
      cause: "Inner tie rod play exceeds tolerance.",
      correction: "Replace worn steering link and align toe.",
      approval_state: "pending",
      status: "awaiting_approval",
      labor_time: 2.2,
      job_type: "repair",
      parts_required: [{ part: "Steering link kit", qty: 1 }],
    },
    {
      woNumber: "DEMO-WO-1003",
      description: "Recommended shock absorbers (deferred)",
      complaint: "Secondary bounce after speed bumps.",
      cause: "Rear dampers weak but still serviceable short-term.",
      correction: "Defer shock replacement to next service window.",
      approval_state: "declined",
      status: "on_hold",
      labor_time: 0.8,
      job_type: "repair",
      parts_required: [{ part: "Rear shock pair", qty: 1 }],
    },
    {
      woNumber: "DEMO-WO-1004",
      description: "Parts bottleneck - ABS wheel speed sensor backorder",
      complaint: "ABS warning lamp intermittently active.",
      cause: "Sensor failed; replacement currently backordered.",
      correction: "Parts requested, hold line until sensor arrives. demo_moment:parts_bottleneck",
      approval_state: "approved",
      status: "on_hold",
      labor_time: 1.1,
      job_type: "repair",
      parts_required: [{ part: "ABS wheel speed sensor", qty: 1 }],
      hold_reason: "Waiting for backordered ABS wheel speed sensor",
    },
    {
      woNumber: "DEMO-WO-1006",
      description: "Municipal inspection findings review",
      complaint: "Municipal unit requires advisor-ready review of inspection findings before release.",
      cause: "Digital DVIR flagged minor deficiencies that need advisor confirmation and scheduling guidance.",
      correction: "Review findings with advisor, document recommendations, and queue follow-up service windows.",
      approval_state: "pending",
      status: "awaiting",
      labor_time: 0.6,
      job_type: "inspection",
      parts_required: [],
    },
    {
      woNumber: "DEMO-WO-1007",
      description: "Wheel seal replacement recurrence",
      complaint: "Repeat brake contamination on TR-101.",
      cause: "Axle seal lip damaged from prior bearing heat cycle.",
      correction: "Replace seal, clean brake assembly, road-test.",
      approval_state: "approved",
      status: "active",
      labor_time: 2.4,
      job_type: "repair",
      parts_required: [{ part: "Axle wheel seal", qty: 1 }],
    },
  ];

  const estimateByDescription: Record<string, { partsEstimate: number }> = {
    "Brake pull and noise verification from inspection findings": { partsEstimate: 88 },
    "Pressure test and leak trace": { partsEstimate: 28 },
    "Approved steering link replacement": { partsEstimate: 525 },
    "Recommended shock absorbers (deferred)": { partsEstimate: 410 },
    "Parts bottleneck - ABS wheel speed sensor backorder": { partsEstimate: 295 },
    "Municipal inspection findings review": { partsEstimate: 0 },
    "Wheel seal replacement recurrence": { partsEstimate: 132 },
  };

  let workOrderLineCount = 0;
  for (const line of lines) {
    const estimate = estimateByDescription[line.description] ?? { partsEstimate: 0 };
    const laborTotal = Number((line.labor_time * DEMO_LABOR_RATE).toFixed(2));
    const lineEstimateTotal = Number((laborTotal + estimate.partsEstimate).toFixed(2));
    const linePayload = {
      shop_id: shopId,
      work_order_id: workOrderIds[line.woNumber],
      user_id: actorProfileId,
      description: line.description,
      complaint: line.complaint,
      cause: line.cause,
      correction: line.correction,
      line_type: "job",
      line_status: line.status,
      status: line.status,
      job_type: line.job_type,
      approval_state: line.approval_state,
      labor_time: line.labor_time,
      price_estimate: lineEstimateTotal,
      hold_reason: line.hold_reason ?? null,
      parts_required: line.parts_required,
    };

    validateSeededWorkOrderLineFields(linePayload);
    validateWorkOrderLineCompletedConstraint(linePayload);

    await upsertByNaturalKey({
      admin,
      table: "work_order_lines",
      match: { shop_id: shopId, work_order_id: workOrderIds[line.woNumber], description: line.description },
      payload: linePayload,
    });
    workOrderLineCount += 1;
  }

  const inspections: Array<[woNumber: string, status: string, notes: string, completed: boolean]> = [
    ["DEMO-WO-1003", "in_progress", "Suspension inspection found urgent steering wear", false],
    ["DEMO-WO-1006", "in_progress", "Municipal inspection ready for advisor review; minor recommendations logged", false],
  ];

  let inspectionCount = 0;
  for (const [woNumber, status, notes, completed] of inspections) {
    const inspectionPayload = {
      shop_id: shopId,
      user_id: actorProfileId,
      work_order_id: workOrderIds[woNumber],
      vehicle_id: woNumber === "DEMO-WO-1006" ? vehicleIds["MU-401"] : vehicleIds["TR-103"],
      inspection_type: "digital_dvir",
      status,
      completed,
      notes,
      summary: {
        failed_items: woNumber === "DEMO-WO-1003" ? ["Tie rod end play exceeds spec"] : [],
        recommended_items: ["Schedule follow-up in 30 days"],
      },
      is_draft: !completed,
    };

    validateInspectionCompletedConstraint(inspectionPayload);

    await upsertByNaturalKey({
      admin,
      table: "inspections",
      match: { shop_id: shopId, work_order_id: workOrderIds[woNumber], inspection_type: "digital_dvir" },
      payload: inspectionPayload,
    });
    inspectionCount += 1;
  }

  return {
    customerCount: customers.length,
    vehicleCount: assets.length,
    workOrderCount: workOrders.length,
    workOrderLineCount,
    inspectionCount,
  };
}
