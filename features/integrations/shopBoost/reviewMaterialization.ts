import { createHash } from "crypto";

import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { setStockOnHandSnapshot } from "@/features/parts/server/setStockOnHandSnapshot";
import {
  computeCompletionState,
  runPostMigrationIntegrityValidation,
  type IgnoreReasonCode,
} from "@/features/integrations/shopBoost/migrationReliability";
import { buildMigrationStory } from "@/features/integrations/shopBoost/migrationStory";
import { toResolutionAction, type RecommendedAction } from "@/features/integrations/shopBoost/reviewGuidance";
import {
  decideCustomerResolution,
  findDeterministicCustomerMatch,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  sourceExternalId,
  type CustomerResolutionType,
} from "@/features/integrations/shopBoost/customerResolution";

type DB = Database;
type AdminClient = ReturnType<typeof createAdminSupabase>;
type ResolutionAction = "linked_to_existing" | "created_new" | "ignored";
type ReviewStatus = "pending" | "resolved" | "materialized" | "failed_materialization" | "ignored";

type ReviewItemRow = {
  id: string;
  shop_id: string;
  intake_id: string;
  domain: string;
  issue_type: string;
  status: string;
  summary: string;
  raw_payload: Record<string, unknown>;
  normalized_payload?: Record<string, unknown>;
  suggested_matches: unknown;
  resolution_action: ResolutionAction | null;
  materialized_at: string | null;
  materialization_error: string | null;
  recommended_action?: "link_existing" | "create_new" | "merge_candidate" | "ignore" | null;
  recommendation_reason?: string | null;
  recommendation_confidence?: number | null;
};

type MaterializeResult = {
  status: ReviewStatus;
  domain?: string;
  action?: ResolutionAction;
  resolutionType?: CustomerResolutionType | "applied" | "skipped";
  matchedRecordId?: string | null;
  createdRecordId?: string | null;
  updatedRecordId?: string | null;
  blockingReason?: string | null;
  errorReason?: string | null;
  materializedRecord: Record<string, unknown> | null;
  error: string | null;
};

type HighRiskCheckResult = {
  highRiskAction: boolean;
  riskReasons: string[];
};
type CustomerPhoneLookupRow = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "phone" | "phone_number">;
type ReviewItemActionRow = Pick<DB["public"]["Tables"]["shop_boost_review_items"]["Row"], "id" | "recommended_action" | "recommendation_confidence">;
type ReviewItemCandidateRow = Pick<DB["public"]["Tables"]["shop_boost_review_items"]["Row"], "id" | "recommended_action">;

function toRecommendedAction(value: unknown): RecommendedAction {
  if (value === "link_existing" || value === "merge_candidate" || value === "ignore") return value;
  return "create_new";
}

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return norm(value).toLowerCase();
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function pick(raw: Record<string, unknown>, patterns: RegExp[]): string | null {
  for (const [k, v] of Object.entries(raw)) {
    const key = lower(k);
    if (patterns.some((pattern) => pattern.test(key))) {
      const n = norm(v);
      if (n) return n;
    }
  }
  return null;
}

function parseMoney(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return null;
  const standardized = cleaned.includes(",") && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  const n = Number(standardized);
  return Number.isFinite(n) ? n : null;
}

async function logReviewAuditEvent(args: {
  supabase: AdminClient;
  item: ReviewItemRow;
  userId: string;
  actionTaken: ResolutionAction | null;
  materializationStatus?: string;
  materializationError?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const recommendedAction = args.item.recommended_action ?? null;
  const followedRecommendation = recommendedAction
    ? toResolutionAction(recommendedAction) === args.actionTaken
    : null;

  await args.supabase.from("shop_boost_review_audit_events").insert({
    shop_id: args.item.shop_id,
    intake_id: args.item.intake_id,
    review_item_id: args.item.id,
    actor_user_id: args.userId,
    event_type: args.materializationStatus ? "resolution_applied" : "recommendation_viewed",
    recommendation: {
      recommended_action: recommendedAction,
      recommendation_reason: args.item.recommendation_reason ?? null,
      recommendation_confidence: args.item.recommendation_confidence ?? null,
    },
    action_taken: args.actionTaken,
    followed_recommendation: followedRecommendation,
    materialization_status: args.materializationStatus ?? null,
    metadata: {
      ...(args.metadata ?? {}),
      materialization_error: args.materializationError ?? null,
    },
  });
}

async function findCustomerId(args: {
  supabase: AdminClient;
  shopId: string;
  raw: Record<string, unknown>;
  normalized?: Record<string, unknown>;
  suggested: unknown;
}): Promise<string | null> {
  const { supabase, shopId, raw, normalized, suggested } = args;
  const payload = { ...(raw ?? {}), ...(normalized ?? {}) };
  const suggestedCustomerId = typeof suggested === "object" && suggested && "customerId" in (suggested as Record<string, unknown>)
    ? String((suggested as Record<string, unknown>).customerId ?? "")
    : "";

  if (suggestedCustomerId) return suggestedCustomerId;
  const sourceCustomerId = pick(payload, [/^customer[_\s-]*id$/, /external customer id/]);
  if (sourceCustomerId) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("external_id", sourceExternalId("customer", sourceCustomerId))
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  const email = normalizeCustomerEmail(pick(payload, [/customer email/, /^email$/]));
  if (email) {
    const { data } = await supabase.from("customers").select("id").eq("shop_id", shopId).eq("email", email).limit(1).maybeSingle();
    if (data?.id) return String(data.id);
  }

  const phone = normalizeCustomerPhone(pick(payload, [/customer phone/, /^phone$/]));
  if (phone) {
    const { data } = await supabase.from("customers").select("id,phone,phone_number").eq("shop_id", shopId).limit(3000);
    const matched = ((data ?? []) as CustomerPhoneLookupRow[]).find((item) => normalizeCustomerPhone(item.phone ?? item.phone_number) === phone);
    if (matched?.id) return String(matched.id);
  }

  return null;
}

async function materializeCustomer(args: { supabase: AdminClient; item: ReviewItemRow; resolutionAction: ResolutionAction; }): Promise<MaterializeResult> {
  const { supabase, item, resolutionAction } = args;
  if (resolutionAction === "ignored") {
    return {
      status: "materialized",
      domain: "customer",
      action: resolutionAction,
      resolutionType: "applied",
      matchedRecordId: null,
      createdRecordId: null,
      updatedRecordId: null,
      blockingReason: null,
      errorReason: null,
      materializedRecord: { ignored: true },
      error: null,
    };
  }

  const raw = item.raw_payload ?? {};
  const normalized = item.normalized_payload ?? {};
  const sourceCustomerId = pick({ ...raw, ...normalized }, [/^customer[_\s-]*id$/, /external customer id/]);
  const email = normalizeCustomerEmail(pick(raw, [/^email$/, /customer email/]));
  const phone = normalizeCustomerPhone(pick(raw, [/^phone$/, /customer phone/, /mobile/]));
  const first = pick(raw, [/^first/, /first name/]);
  const last = pick(raw, [/^last/, /last name/]);
  const name = pick(raw, [/^name$/, /customer name/]) ?? [first ?? "", last ?? ""].filter(Boolean).join(" ");
  const business = pick(raw, [/business/, /company/, /fleet/]);

  const externalId = `import:${item.intake_id}:customers:${sha1(`${email}|${phone}|${name}|${business ?? ""}`).slice(0, 16)}`;

  const suggested = item.suggested_matches;
  const explicitCandidateId = Array.isArray(suggested)
    ? String(
        (suggested.find((candidate) => typeof candidate === "object" && candidate && ("customerId" in (candidate as Record<string, unknown>) || "id" in (candidate as Record<string, unknown>))) as Record<string, unknown> | undefined)?.customerId ??
          (suggested.find((candidate) => typeof candidate === "object" && candidate && ("customerId" in (candidate as Record<string, unknown>) || "id" in (candidate as Record<string, unknown>))) as Record<string, unknown> | undefined)?.id ??
          "",
      )
    : typeof suggested === "object" && suggested
      ? String((suggested as Record<string, unknown>).customerId ?? (suggested as Record<string, unknown>).id ?? "")
      : "";

  const deterministicMatch = await findDeterministicCustomerMatch({
    supabase,
    shopId: item.shop_id,
    sourceCustomerId,
    email,
    phone,
  });

  const decision = decideCustomerResolution({
    context: "review",
    resolutionAction: resolutionAction === "linked_to_existing" ? "linked_to_existing" : "created_new",
    deterministicMatch,
    explicitCandidateId,
  });

  if (
    decision.resolutionType === "matched_existing_by_external_id" ||
    decision.resolutionType === "matched_existing_by_email" ||
    decision.resolutionType === "matched_existing_by_phone" ||
    decision.resolutionType === "updated_existing_customer"
  ) {
    const customerId = decision.matchedRecordId;
    if (!customerId) {
      return {
        status: "failed_materialization",
        domain: "customer",
        action: resolutionAction,
        resolutionType: "unresolved",
        matchedRecordId: null,
        createdRecordId: null,
        updatedRecordId: null,
        blockingReason: "no_match_for_update",
        errorReason: "Unable to locate selected existing customer.",
        materializedRecord: null,
        error: "Unable to locate selected existing customer.",
      };
    }
    await supabase.from("customers").update({ source_intake_id: item.intake_id, external_id: externalId }).eq("id", customerId).eq("shop_id", item.shop_id);
    return {
      status: "materialized",
      domain: "customer",
      action: resolutionAction,
      resolutionType: decision.resolutionType,
      matchedRecordId: customerId,
      createdRecordId: null,
      updatedRecordId: customerId,
      blockingReason: null,
      errorReason: null,
      materializedRecord: { domain: "customer", customerId, resolutionType: decision.resolutionType },
      error: null,
    };
  }

  if (decision.resolutionType === "blocked_duplicate_conflict" || decision.resolutionType === "merge_candidate_requires_confirmation") {
    const message = decision.resolutionType === "blocked_duplicate_conflict"
      ? "Create blocked: deterministic duplicate evidence exists for this shop."
      : "Unable to locate selected existing customer.";
    return {
      status: "failed_materialization",
      domain: "customer",
      action: resolutionAction,
      resolutionType: decision.resolutionType,
      matchedRecordId: decision.matchedRecordId,
      createdRecordId: null,
      updatedRecordId: null,
      blockingReason: decision.blockingReason,
      errorReason: message,
      materializedRecord: {
        domain: "customer",
        resolutionType: decision.resolutionType,
        matchedRecordId: decision.matchedRecordId,
        blockingReason: decision.blockingReason,
      },
      error: message,
    };
  }

  const { data: inserted, error } = await supabase.from("customers").insert({
    shop_id: item.shop_id,
    first_name: first ?? null,
    last_name: last ?? null,
    name: name || null,
    email: email || null,
    phone: phone || null,
    phone_number: phone || null,
    business_name: business ?? null,
    source_intake_id: item.intake_id,
    external_id: externalId,
  }).select("id").limit(1).maybeSingle();
  if (error || !inserted?.id) {
    const duplicateConflict = /customers_shop_email_uq|duplicate key value/i.test(error?.message ?? "");
    if (duplicateConflict) {
      const recoveredMatch = await findDeterministicCustomerMatch({
        supabase,
        shopId: item.shop_id,
        sourceCustomerId,
        email,
        phone,
      });
      if (recoveredMatch?.customerId) {
        return {
          status: "failed_materialization",
          domain: "customer",
          action: resolutionAction,
          resolutionType: "blocked_duplicate_conflict",
          matchedRecordId: recoveredMatch.customerId,
          createdRecordId: null,
          updatedRecordId: null,
          blockingReason: "deterministic_duplicate_exists",
          errorReason: "Create blocked: deterministic duplicate evidence exists for this shop.",
          materializedRecord: {
            domain: "customer",
            resolutionType: "blocked_duplicate_conflict",
            matchedRecordId: recoveredMatch.customerId,
            blockingReason: "deterministic_duplicate_exists",
          },
          error: "Create blocked: deterministic duplicate evidence exists for this shop.",
        };
      }
      return {
        status: "failed_materialization",
        domain: "customer",
        action: resolutionAction,
        resolutionType: "merge_candidate_requires_confirmation",
        matchedRecordId: null,
        createdRecordId: null,
        updatedRecordId: null,
        blockingReason: "merge_review_required",
        errorReason: "Create blocked: duplicate evidence requires merge review before materialization.",
        materializedRecord: {
          domain: "customer",
          resolutionType: "merge_candidate_requires_confirmation",
          blockingReason: "merge_review_required",
        },
        error: "Create blocked: duplicate evidence requires merge review before materialization.",
      };
    }
    return {
      status: "failed_materialization",
      domain: "customer",
      action: resolutionAction,
      resolutionType: "unresolved",
      matchedRecordId: null,
      createdRecordId: null,
      updatedRecordId: null,
      blockingReason: null,
      errorReason: error?.message ?? "Failed to create customer.",
      materializedRecord: null,
      error: error?.message ?? "Failed to create customer.",
    };
  }

  const customerId = String(inserted.id);
  return {
    status: "materialized",
    domain: "customer",
    action: resolutionAction,
    resolutionType: "created_new_customer",
    matchedRecordId: null,
    createdRecordId: customerId,
    updatedRecordId: null,
    blockingReason: null,
    errorReason: null,
    materializedRecord: { domain: "customer", customerId, resolutionType: "created_new_customer" },
    error: null,
  };
}

async function materializeVehicle(args: { supabase: AdminClient; item: ReviewItemRow; resolutionAction: ResolutionAction; }): Promise<MaterializeResult> {
  const { supabase, item, resolutionAction } = args;
  if (resolutionAction === "ignored") return { status: "materialized", materializedRecord: { ignored: true }, error: null };

  const raw = item.raw_payload ?? {};
  const normalized = item.normalized_payload ?? {};
  const customerId = await findCustomerId({ supabase, shopId: item.shop_id, raw, normalized, suggested: item.suggested_matches });
  if (!customerId) return { status: "failed_materialization", materializedRecord: null, error: "Customer dependency is still unresolved for this vehicle." };

  const vin = lower(pick(raw, [/^vin$/, /vehicle vin/]));
  const plate = lower(pick(raw, [/plate/, /license/]));
  const unit = pick(raw, [/unit/, /truck number/]);
  const yearRaw = pick(raw, [/^year$/, /model year/]);
  const year = yearRaw ? Number(yearRaw.replace(/[^0-9]/g, "")) : null;
  const make = pick(raw, [/^make$/]);
  const model = pick(raw, [/^model$/]);

  const sourceVehicleId = pick(raw, [/^vehicle[_\s-]*id$/, /external vehicle id/]);
  const externalId = sourceVehicleId
    ? sourceExternalId("vehicle", sourceVehicleId)
    : `import:${item.intake_id}:vehicles:${sha1(`${vin}|${plate}|${unit ?? ""}|${year ?? ""}`).slice(0, 16)}`;

  let vehicleId: string | null = null;
  const { data: existingByExternal } = await supabase.from("vehicles").select("id").eq("shop_id", item.shop_id).eq("external_id", externalId).maybeSingle();
  vehicleId = existingByExternal?.id ?? null;

  if (!vehicleId && resolutionAction === "linked_to_existing") {
    const vehicleLookupFilter = [vin ? `vin.eq.${vin}` : null, plate ? `license_plate.eq.${plate}` : null].filter(Boolean).join(",");
    if (vehicleLookupFilter) {
      const { data: existingByIdentity } = await supabase
        .from("vehicles")
        .select("id")
        .eq("shop_id", item.shop_id)
        .or(vehicleLookupFilter)
        .limit(1)
        .maybeSingle();
      vehicleId = existingByIdentity?.id ?? null;
    }
  }

  const payload = {
    shop_id: item.shop_id,
    customer_id: customerId,
    vin: vin || null,
    license_plate: plate || null,
    unit_number: unit ?? null,
    year: Number.isFinite(year) ? year : null,
    make: make ?? null,
    model: model ?? null,
    source_intake_id: item.intake_id,
    external_id: externalId,
  };

  if (vehicleId) {
    const { data: existingVehicle } = await supabase.from("vehicles").select("customer_id").eq("id", vehicleId).eq("shop_id", item.shop_id).maybeSingle();
    const existingOwner = String(existingVehicle?.customer_id ?? "");
    if (existingOwner && existingOwner !== customerId) {
      return {
        status: "failed_materialization",
        materializedRecord: null,
        error: "Unsafe owner relink blocked. Vehicle owner differs from matched customer; manual high-risk review required.",
      };
    }
    await supabase.from("vehicles").update(payload).eq("id", vehicleId).eq("shop_id", item.shop_id);
  } else {
    const { data: inserted, error } = await supabase.from("vehicles").insert(payload).select("id").limit(1).maybeSingle();
    if (error || !inserted?.id) return { status: "failed_materialization", materializedRecord: null, error: error?.message ?? "Failed to materialize vehicle." };
    vehicleId = String(inserted.id);
  }

  return { status: "materialized", materializedRecord: { domain: "vehicle", vehicleId, customerId }, error: null };
}

async function materializeWorkOrder(args: { supabase: AdminClient; item: ReviewItemRow; resolutionAction: ResolutionAction; }): Promise<MaterializeResult> {
  const { supabase, item, resolutionAction } = args;
  if (resolutionAction === "ignored") return { status: "materialized", materializedRecord: { ignored: true }, error: null };

  const raw = item.raw_payload ?? {};
  const normalized = item.normalized_payload ?? {};
  const customerId = await findCustomerId({ supabase, shopId: item.shop_id, raw, normalized, suggested: item.suggested_matches });
  if (!customerId) return { status: "failed_materialization", materializedRecord: null, error: "Missing customer dependency for work order." };

  const sourceVehicleId = pick(raw, [/^vehicle[_\s-]*id$/, /external vehicle id/]);
  const vin = lower(pick(raw, [/vin/]));
  const plate = lower(pick(raw, [/plate/, /license/]));
  const vehicleBySource = sourceVehicleId
    ? (
        await supabase
          .from("vehicles")
          .select("id")
          .eq("shop_id", item.shop_id)
          .eq("external_id", sourceExternalId("vehicle", sourceVehicleId))
          .maybeSingle()
      ).data
    : null;
  const vehicleLookup = [vin ? `vin.eq.${vin}` : null, plate ? `license_plate.eq.${plate}` : null].filter(Boolean).join(",");
  const vehicle = vehicleBySource ?? (vehicleLookup
    ? (await supabase
        .from("vehicles")
        .select("id")
        .eq("shop_id", item.shop_id)
        .or(vehicleLookup)
        .limit(1)
        .maybeSingle()).data
    : null);

  const vehicleId = vehicle?.id ? String(vehicle.id) : null;
  if (!vehicleId) return { status: "failed_materialization", materializedRecord: null, error: "Missing vehicle dependency for work order." };
  if (!customerId || !vehicleId) {
    return {
      status: "failed_materialization",
      materializedRecord: null,
      error: "Hard block: work order cannot materialize without both customer and vehicle dependencies.",
    };
  }

  const ro = pick(raw, [/^ro$/, /ro number/, /work order/, /order number/, /invoice number/]) ?? null;
  const total = parseMoney(pick(raw, [/total/, /grand total/, /invoice total/]));
  const labor = parseMoney(pick(raw, [/labor/, /labour/]));
  const parts = parseMoney(pick(raw, [/parts/]));
  const complaint = pick(raw, [/complaint/, /concern/]);
  const correction = pick(raw, [/correction/, /work performed/, /description/]);

  const sourceWorkOrderId = pick(raw, [/^work[_\s-]*order[_\s-]*id$/, /^wo[_\s-]*id$/, /^ro[_\s-]*id$/, /^invoice[_\s-]*id$/]);
  const fingerprint = sha1([ro ?? "", customerId, vehicleId, String(total ?? ""), lower(correction ?? complaint ?? "")].join("|")).slice(0, 20);
  const externalId = sourceWorkOrderId
    ? sourceExternalId("work_order", sourceWorkOrderId)
    : `import:${item.intake_id}:history:${fingerprint}`;

  let workOrderId: string;
  const woPayload = {
    shop_id: item.shop_id,
    customer_id: customerId,
    vehicle_id: vehicleId,
    status: "completed",
    type: "repair",
    custom_id: ro,
    customer_name: pick(raw, [/customer name/, /^name$/]) ?? null,
    labor_total: labor ?? null,
    parts_total: parts ?? null,
    invoice_total: total ?? null,
    source_intake_id: item.intake_id,
    external_id: externalId,
  };

  const { data: existingWo } = await supabase.from("work_orders").select("id").eq("shop_id", item.shop_id).eq("external_id", externalId).maybeSingle();
  if (existingWo?.id) {
    workOrderId = String(existingWo.id);
    await supabase.from("work_orders").update(woPayload).eq("id", workOrderId).eq("shop_id", item.shop_id);
  } else {
    const { data: insertedWo, error: woErr } = await supabase.from("work_orders").insert(woPayload).select("id").limit(1).maybeSingle();
    if (woErr || !insertedWo?.id) return { status: "failed_materialization", materializedRecord: null, error: woErr?.message ?? "Failed to create work order." };
    workOrderId = String(insertedWo.id);
  }

  const lineExternal = `import:${item.intake_id}:wol:${workOrderId}:1`;
  const linePayload = {
    shop_id: item.shop_id,
    work_order_id: workOrderId,
    vehicle_id: vehicleId,
    complaint: complaint ?? null,
    correction: correction ?? null,
    description: correction ?? complaint ?? "Imported history line",
    status: "completed",
    job_type: "repair",
    line_no: 1,
    source_intake_id: item.intake_id,
    external_id: lineExternal,
  };

  const { data: existingLine } = await supabase.from("work_order_lines").select("id").eq("shop_id", item.shop_id).eq("external_id", lineExternal).maybeSingle();
  if (existingLine?.id) {
    await supabase.from("work_order_lines").update(linePayload).eq("id", existingLine.id);
  } else {
    await supabase.from("work_order_lines").insert(linePayload);
  }

  if ((total ?? 0) > 0 || (labor ?? 0) > 0 || (parts ?? 0) > 0) {
    const { data: existingInvoice } = await supabase.from("invoices").select("id").eq("shop_id", item.shop_id).eq("work_order_id", workOrderId).maybeSingle();
    if (!existingInvoice?.id) {
      await supabase.from("invoices").insert({
        shop_id: item.shop_id,
        work_order_id: workOrderId,
        customer_id: customerId,
        status: "paid",
        subtotal: Math.max(0, (labor ?? 0) + (parts ?? 0)),
        labor_cost: labor ?? 0,
        parts_cost: parts ?? 0,
        total: total ?? Math.max(0, (labor ?? 0) + (parts ?? 0)),
        invoice_number: `IMP-${workOrderId.slice(0, 8)}`,
        currency: "USD",
        metadata: { imported: true, source_intake_id: item.intake_id },
      });
    }
  }

  return { status: "materialized", materializedRecord: { domain: "work_order", workOrderId, customerId, vehicleId }, error: null };
}

async function materializePart(args: { supabase: AdminClient; item: ReviewItemRow; resolutionAction: ResolutionAction; }): Promise<MaterializeResult> {
  const { supabase, item, resolutionAction } = args;
  if (resolutionAction === "ignored") return { status: "materialized", materializedRecord: { ignored: true }, error: null };

  const raw = item.raw_payload ?? {};
  const name = pick(raw, [/^name$/, /part name/, /description/, /item name/]) ?? "Imported Part";
  const partNumber = pick(raw, [/part number/, /^pn$/, /p\/n/, /part_no/, /part #/]);
  const sku = pick(raw, [/^sku$/, /item sku/, /stock code/]);
  const qtyRaw = pick(raw, [/qty/, /quantity/, /on hand/, /stock/]);
  const quantityOnHand = qtyRaw ? Number(qtyRaw.replace(/[^0-9.-]/g, "")) : null;

  const externalId = `import:${item.intake_id}:parts:${sha1(`${lower(partNumber)}|${lower(sku)}|${lower(name)}`).slice(0, 16)}`;

  let partId: string | null = null;
  if (resolutionAction === "linked_to_existing") {
    const partLookup = [partNumber ? `part_number.eq.${partNumber}` : null, sku ? `sku.eq.${sku}` : null, `name.eq.${name}`].filter(Boolean).join(",");
    const { data: existing } = await supabase
      .from("parts")
      .select("id")
      .eq("shop_id", item.shop_id)
      .or(partLookup)
      .limit(1)
      .maybeSingle();
    partId = existing?.id ?? null;
    if (!partId) return { status: "failed_materialization", materializedRecord: null, error: "Unable to locate existing part to link." };
    const incomingSku = lower(sku);
    const incomingPartNumber = lower(partNumber);
    const { data: currentPart } = await supabase.from("parts").select("sku,part_number").eq("id", partId).eq("shop_id", item.shop_id).maybeSingle();
    const currentSku = lower(currentPart?.sku);
    const currentPartNumber = lower(currentPart?.part_number);
    if ((incomingSku && currentSku && incomingSku !== currentSku) || (incomingPartNumber && currentPartNumber && incomingPartNumber !== currentPartNumber)) {
      return {
        status: "failed_materialization",
        materializedRecord: null,
        error: "Unsafe part overwrite blocked. Incoming SKU/part number conflicts with existing record.",
      };
    }
    await supabase.from("parts").update({ source_intake_id: item.intake_id }).eq("id", partId);
  } else {
    const { data: existingByExternal } = await supabase.from("parts").select("id").eq("shop_id", item.shop_id).eq("external_id", externalId).maybeSingle();
    partId = existingByExternal?.id ?? null;
    if (!partId) {
      const { data: inserted, error } = await supabase.from("parts").insert({
        shop_id: item.shop_id,
        name,
        part_number: partNumber,
        sku,
        source_intake_id: item.intake_id,
        external_id: externalId,
      }).select("id").limit(1).maybeSingle();
      if (error || !inserted?.id) return { status: "failed_materialization", materializedRecord: null, error: error?.message ?? "Failed to create part." };
      partId = String(inserted.id);
    }
  }

  const { data: defaultLocation } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("shop_id", item.shop_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (defaultLocation?.id && Number.isFinite(quantityOnHand)) {
    try {
      await setStockOnHandSnapshot({
        client: supabase,
        shopId: item.shop_id,
        partId,
        locationId: defaultLocation.id,
        targetQty: Math.max(0, quantityOnHand ?? 0),
        idempotencyKey: `${item.shop_id}:inventory-snapshot:review:${item.intake_id}:${item.id}`,
        metadata: {
          intake_id: item.intake_id,
          review_item_id: item.id,
          source: "shop_boost_review_materialization",
        },
      });
    } catch (error) {
      return {
        status: "failed_materialization",
        materializedRecord: null,
        error: error instanceof Error ? error.message : "Failed to set imported inventory quantity.",
      };
    }
  }

  return { status: "materialized", materializedRecord: { domain: "part", partId }, error: null };
}

async function materializeByDomain(args: { supabase: AdminClient; item: ReviewItemRow; resolutionAction: ResolutionAction; }): Promise<MaterializeResult> {
  const domain = args.item.domain;
  if (domain === "customer") return materializeCustomer(args);
  if (domain === "vehicle") return materializeVehicle(args);
  if (domain === "work_order" || domain === "history" || domain === "invoice") return materializeWorkOrder(args);
  if (domain === "part") return materializePart(args);
  return { status: "materialized", materializedRecord: { skipped: true, domain }, error: null };
}

async function recomputeMigrationProgress(supabase: AdminClient, shopId: string, intakeId: string): Promise<void> {
  const [{ count: pendingCount }, { count: failedCount }, { count: materializedCount }, { count: ignoredCount }, { data: intake }, { count: duplicateMergedCount }] = await Promise.all([
    supabase.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "pending"),
    supabase.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "failed_materialization"),
    supabase.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "materialized"),
    supabase.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "ignored"),
    supabase.from("shop_boost_intakes").select("intake_basics").eq("id", intakeId).eq("shop_id", shopId).maybeSingle(),
    supabase
      .from("shop_boost_review_items")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("domain", "customer")
      .in("issue_type", ["duplicate_candidate", "conflict"])
      .eq("resolution_action", "linked_to_existing")
      .in("status", ["resolved", "materialized"]),
  ]);

  const basics = (intake?.intake_basics ?? {}) as Record<string, unknown>;
  const migrationProgress = (basics.migrationProgress ?? {}) as Record<string, unknown>;
  const reviewCount = (pendingCount ?? 0) + (failedCount ?? 0);
  const successCount = Math.max(
    Number(migrationProgress.success_count ?? 0),
    Number(materializedCount ?? 0),
  );

  const integrity = await runPostMigrationIntegrityValidation({ shopId, intakeId });
  const integrityErrors = integrity.integrityErrors;
  const importSummary = (basics.importSummary ?? {}) as Record<string, unknown>;
  const linkageSummary = (importSummary.linkageSummary ?? {}) as Record<string, unknown>;
  const linked = (linkageSummary.linked ?? {}) as Record<string, unknown>;
  const existingOutcomeBuckets = (migrationProgress.row_outcome_buckets ?? {}) as Record<string, unknown>;
  const migrationStory = buildMigrationStory({
    totalRows: Number(migrationProgress.total_rows ?? 0),
    outcomeBuckets: {
      materialized: Number(existingOutcomeBuckets.materialized ?? 0),
      linked: Number(existingOutcomeBuckets.linked ?? 0),
      ignored: Number(ignoredCount ?? 0),
      failed: Number(existingOutcomeBuckets.failed ?? 0),
    },
    reviewResolvedCount: Number(materializedCount ?? 0),
    pendingReviewCount: Number(pendingCount ?? 0),
    failedReviewCount: Number(failedCount ?? 0),
    failedCount: Number(migrationProgress.failed_count ?? 0),
    integrityErrorsCount: integrityErrors.length,
    confidenceScore: Number(migrationProgress.confidence_score ?? 0.5),
    integrityChecks: integrity.checks as Record<string, unknown>,
    keyFixCounts: {
      duplicateCustomersMerged: Number(duplicateMergedCount ?? 0),
      vehiclesLinkedToCustomers: Number(linked.vehiclesCustomerId ?? 0),
      workOrdersRecoveredVehicleLinks: Number(linked.workOrdersVehicleId ?? 0),
    },
  });
  const completionState = computeCompletionState({
    failedCount: Number(migrationProgress.failed_count ?? 0),
    pendingReviewCount: pendingCount ?? 0,
    failedReviewCount: failedCount ?? 0,
    integrityStatus: integrity.status,
    integrityErrorsCount: integrityErrors.length,
  });

  await supabase
    .from("shop_boost_intakes")
    .update({
      intake_basics: {
        ...basics,
        migrationProgress: {
          ...migrationProgress,
          review_count: reviewCount,
          success_count: successCount,
          ignored_count: ignoredCount ?? 0,
          completionState,
          integrity,
          migration_story: migrationStory,
        },
        migration_story: migrationStory,
      },
    })
    .eq("id", intakeId)
    .eq("shop_id", shopId);
}

export async function resolveAndMaterializeReviewItem(args: {
  reviewItemId: string;
  shopId: string;
  userId: string;
  resolutionAction: ResolutionAction;
  confirmHighRiskAction?: boolean;
  ignoreReasonCode?: IgnoreReasonCode;
  ignoreNote?: string | null;
}): Promise<{
  ok: boolean;
  item: ReviewItemRow | null;
  materializedRecord: Record<string, unknown> | null;
  appliedResult: {
    reviewItemId: string;
    domain: string | null;
    action: ResolutionAction;
    status: ReviewStatus | string | null;
    resolutionType: string | null;
    materializedRecord: Record<string, unknown> | null;
    matchedRecordId: string | null;
    createdRecordId: string | null;
    updatedRecordId: string | null;
    blockingReason: string | null;
    errorReason: string | null;
  };
  error?: string;
}> {
  const supabase = createAdminSupabase();

  const { data: item } = await supabase
    .from("shop_boost_review_items")
    .select("id,shop_id,intake_id,domain,issue_type,status,summary,raw_payload,normalized_payload,suggested_matches,resolution_action,materialized_at,materialization_error,recommended_action,recommendation_reason,recommendation_confidence")
    .eq("shop_id", args.shopId)
    .eq("id", args.reviewItemId)
    .maybeSingle();

  if (!item) {
    return {
      ok: false,
      item: null,
      materializedRecord: null,
      appliedResult: {
        reviewItemId: args.reviewItemId,
        domain: null,
        action: args.resolutionAction,
        status: null,
        resolutionType: "unresolved",
        materializedRecord: null,
        matchedRecordId: null,
        createdRecordId: null,
        updatedRecordId: null,
        blockingReason: "review_item_not_found",
        errorReason: "Review item not found.",
      },
      error: "Review item not found.",
    };
  }

  const riskCheck: HighRiskCheckResult = {
    highRiskAction:
      args.resolutionAction === "linked_to_existing" &&
      (item.recommended_action === "merge_candidate" || item.issue_type === "conflict" || item.issue_type === "duplicate_candidate"),
    riskReasons: [],
  };
  if (riskCheck.highRiskAction) {
    riskCheck.riskReasons.push("Potential merge/duplicate conflict action.");
  }
  if (riskCheck.highRiskAction && !args.confirmHighRiskAction) {
    return {
      ok: false,
      item: item as ReviewItemRow,
      materializedRecord: null,
      appliedResult: {
        reviewItemId: item.id,
        domain: item.domain,
        action: args.resolutionAction,
        status: item.status,
        resolutionType: "merge_candidate_requires_confirmation",
        materializedRecord: null,
        matchedRecordId: null,
        createdRecordId: null,
        updatedRecordId: null,
        blockingReason: "high_risk_confirmation_required",
        errorReason: "High-risk action requires explicit confirmation before applying.",
      },
      error: "High-risk action requires explicit confirmation before applying.",
    };
  }

  const updateBase = {
    status: args.resolutionAction === "ignored" ? "ignored" : "resolved",
    resolution_action: args.resolutionAction,
    resolved_by: args.userId,
    resolved_at: new Date().toISOString(),
    ignored_at: args.resolutionAction === "ignored" ? new Date().toISOString() : null,
    ignore_reason_code: args.resolutionAction === "ignored" ? args.ignoreReasonCode ?? "other" : null,
    ignore_note: args.resolutionAction === "ignored" ? args.ignoreNote ?? null : null,
    materialization_error: null,
  };

  await supabase.from("shop_boost_review_items").update(updateBase).eq("id", item.id).eq("shop_id", args.shopId);

  const materialized = args.resolutionAction === "ignored"
    ? { status: "ignored" as ReviewStatus, materializedRecord: { ignored: true, reason: args.ignoreReasonCode ?? "other" }, error: null }
    : await materializeByDomain({
        supabase,
        item: { ...item, resolution_action: args.resolutionAction, status: "resolved" } as ReviewItemRow,
        resolutionAction: args.resolutionAction,
      });

  const followedRecommendation = item.recommended_action
    ? toResolutionAction(item.recommended_action) === args.resolutionAction
    : null;

  await supabase
    .from("shop_boost_review_items")
    .update({
      status: materialized.status,
      materialized_at: materialized.status === "materialized" ? new Date().toISOString() : null,
      materialization_error: materialized.error,
      materialized_record: {
        ...(materialized.materializedRecord ?? {}),
        high_risk_action: riskCheck.highRiskAction,
        high_risk_reasons: riskCheck.riskReasons,
      },
      recommendation_followed: followedRecommendation,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .eq("shop_id", args.shopId);

  await logReviewAuditEvent({
    supabase,
    item: item as ReviewItemRow,
    userId: args.userId,
    actionTaken: args.resolutionAction,
    materializationStatus: materialized.status,
    materializationError: materialized.error,
    metadata: {
      review_item_status_before: item.status,
      high_risk_action: riskCheck.highRiskAction,
      high_risk_reasons: riskCheck.riskReasons,
    },
  });

  if (materialized.status === "materialized") {
    await replayDependentRows({ supabase, shopId: args.shopId, intakeId: item.intake_id });
  }

  await recomputeMigrationProgress(supabase, args.shopId, item.intake_id);

  const { data: updatedItem } = await supabase
    .from("shop_boost_review_items")
    .select("id,shop_id,intake_id,domain,issue_type,status,summary,raw_payload,normalized_payload,suggested_matches,resolution_action,materialized_at,materialization_error,recommended_action,recommendation_reason,recommendation_confidence")
    .eq("id", item.id)
    .eq("shop_id", args.shopId)
    .maybeSingle();

  return {
    ok: materialized.status === "materialized" || materialized.status === "ignored",
    item: updatedItem ?? null,
    materializedRecord: materialized.materializedRecord,
    appliedResult: {
      reviewItemId: item.id,
      domain: updatedItem?.domain ?? item.domain,
      action: args.resolutionAction,
      status: updatedItem?.status ?? materialized.status,
      resolutionType: materialized.resolutionType ?? null,
      materializedRecord: materialized.materializedRecord ?? null,
      matchedRecordId: materialized.matchedRecordId ?? null,
      createdRecordId: materialized.createdRecordId ?? null,
      updatedRecordId: materialized.updatedRecordId ?? null,
      blockingReason: materialized.blockingReason ?? null,
      errorReason: materialized.errorReason ?? materialized.error ?? null,
    },
    ...(materialized.error ? { error: materialized.error } : {}),
  };
}

type ReviewMaterializationOutcome = {
  id: string;
  ok: boolean;
  error?: string;
  appliedResult?: {
    reviewItemId: string;
    domain: ReviewItemRow["domain"] | null;
    status: ReviewItemRow["status"] | null;
    resolutionAction: ResolutionAction;
    materializedRecord: Record<string, unknown> | null;
  };
};

async function replayDependentRows(args: { supabase: AdminClient; shopId: string; intakeId: string; }): Promise<void> {
  const { supabase, shopId, intakeId } = args;
  const { data: replayCandidates } = await supabase
    .from("shop_boost_review_items")
    .select("id,shop_id,intake_id,domain,issue_type,status,summary,raw_payload,normalized_payload,suggested_matches,resolution_action,materialized_at,materialization_error,recommended_action,recommendation_reason,recommendation_confidence")
    .eq("shop_id", shopId)
    .eq("intake_id", intakeId)
    .eq("issue_type", "missing_dependency")
    .in("status", ["pending", "resolved", "failed_materialization"])
    .order("created_at", { ascending: true })
    .limit(100);

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  for (const candidate of replayCandidates ?? []) {
    attempted += 1;
    const action: ResolutionAction = candidate.resolution_action ?? "created_new";
    const result = await materializeByDomain({ supabase, item: candidate as ReviewItemRow, resolutionAction: action });
    if (result.status === "materialized") succeeded += 1;
    if (result.status === "failed_materialization") failed += 1;

    await supabase
      .from("shop_boost_review_items")
      .update({
        status: result.status,
        resolution_action: action,
        resolved_at: result.status === "materialized" ? new Date().toISOString() : null,
        materialized_at: result.status === "materialized" ? new Date().toISOString() : null,
        materialization_error: result.error,
        materialized_record: result.materializedRecord ?? {},
      })
      .eq("shop_id", shopId)
      .eq("id", candidate.id);
  }

  const { data: intake } = await supabase
    .from("shop_boost_intakes")
    .select("intake_basics")
    .eq("id", intakeId)
    .eq("shop_id", shopId)
    .maybeSingle();
  const basics = (intake?.intake_basics ?? {}) as Record<string, unknown>;
  const migrationProgress = (basics.migrationProgress ?? {}) as Record<string, unknown>;

  await supabase
    .from("shop_boost_intakes")
    .update({
      intake_basics: {
        ...basics,
        migrationProgress: {
          ...migrationProgress,
          replay_stats: {
            attempted,
            succeeded,
            failed,
            replayedAt: new Date().toISOString(),
          },
        },
      },
    })
    .eq("id", intakeId)
    .eq("shop_id", shopId);
}


export async function applyHighConfidenceRecommendations(args: {
  shopId: string;
  userId: string;
  intakeId?: string;
  threshold?: number;
}): Promise<ReviewMaterializationOutcome[]> {
  const supabase = createAdminSupabase();
  const threshold = Math.max(0, Math.min(0.99, args.threshold ?? 0.85));

  let query = supabase
    .from("shop_boost_review_items")
    .select("id,recommended_action,recommendation_confidence")
    .eq("shop_id", args.shopId)
    .eq("status", "pending")
    .gte("recommendation_confidence", threshold)
    .not("recommended_action", "is", null)
    .order("recommendation_confidence", { ascending: false })
    .limit(200);

  if (args.intakeId) query = query.eq("intake_id", args.intakeId);
  const { data } = await query;

  const results: ReviewMaterializationOutcome[] = [];
  for (const row of (data ?? []) as ReviewItemActionRow[]) {
    const confidence = Number(row.recommendation_confidence ?? 0);
    if (confidence < 0.85) continue;
    const action = toResolutionAction(toRecommendedAction(row.recommended_action));
    if (action === "linked_to_existing" && String(row.recommended_action) === "merge_candidate") {
      results.push({ id: String(row.id), ok: false, error: "High-risk merge candidates are never auto-applied." });
      continue;
    }
    const result = await resolveAndMaterializeReviewItem({
      reviewItemId: String(row.id),
      shopId: args.shopId,
      userId: args.userId,
      resolutionAction: action,
      ignoreReasonCode: action === "ignored" ? "other" : undefined,
    });
    results.push({
      id: String(row.id),
      ok: result.ok,
      ...(result.error ? { error: result.error } : {}),
      appliedResult: {
        reviewItemId: result.item?.id ?? String(row.id),
        domain: result.item?.domain ?? null,
        status: result.item?.status ?? null,
        resolutionAction: action,
        materializedRecord: result.materializedRecord ?? null,
      },
    });
  }

  return results;
}

export async function reprocessReviewItems(args: {
  shopId: string;
  userId: string;
  intakeId?: string;
  mode: "failed" | "unresolved" | "updated_matches";
  reprocessReason?: string;
}): Promise<{ resetCount: number; results: ReviewMaterializationOutcome[] }> {
  const supabase = createAdminSupabase();
  let statuses: string[] = [];
  if (args.mode === "failed") statuses = ["failed_materialization"];
  if (args.mode === "unresolved") statuses = ["pending", "failed_materialization"];
  if (args.mode === "updated_matches") statuses = ["pending", "failed_materialization", "resolved"];

  let base = supabase
    .from("shop_boost_review_items")
    .select("id,recommended_action")
    .eq("shop_id", args.shopId)
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .limit(250);
  if (args.intakeId) base = base.eq("intake_id", args.intakeId);
  const { data: candidates } = await base;

  const ids = ((candidates ?? []) as ReviewItemCandidateRow[]).map((row) => String(row.id));
  if (ids.length === 0) return { resetCount: 0, results: [] };

  await supabase
    .from("shop_boost_review_items")
    .update({ status: "pending", materialization_error: null, materialized_record: null, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("shop_id", args.shopId);

  if (ids.length > 0) {
    await supabase.from("shop_boost_review_audit_events").insert({
      shop_id: args.shopId,
      intake_id: args.intakeId ?? null,
      actor_user_id: args.userId,
      event_type: "reprocess_requested",
      metadata: {
        mode: args.mode,
        reset_count: ids.length,
        reprocess_reason: args.reprocessReason ?? "operator_requested",
      },
    });
  }

  const results: ReviewMaterializationOutcome[] = [];
  for (const row of (candidates ?? []) as ReviewItemCandidateRow[]) {
    const recommended = toRecommendedAction(row.recommended_action);
    const action = toResolutionAction(recommended);
    const result = await resolveAndMaterializeReviewItem({
      reviewItemId: String(row.id),
      shopId: args.shopId,
      userId: args.userId,
      resolutionAction: action,
      ignoreReasonCode: action === "ignored" ? "other" : undefined,
    });
    results.push({
      id: String(row.id),
      ok: result.ok,
      ...(result.error ? { error: result.error } : {}),
      appliedResult: {
        reviewItemId: result.item?.id ?? String(row.id),
        domain: result.item?.domain ?? null,
        status: result.item?.status ?? null,
        resolutionAction: action,
        materializedRecord: result.materializedRecord ?? null,
      },
    });
  }

  return { resetCount: ids.length, results };
}

export async function bulkResolveReviewItems(args: {
  shopId: string;
  userId: string;
  reviewItemIds: string[];
  resolutionAction: ResolutionAction;
  ignoreReasonCode?: IgnoreReasonCode;
  ignoreNote?: string | null;
}): Promise<ReviewMaterializationOutcome[]> {
  const results: ReviewMaterializationOutcome[] = [];
  for (const id of args.reviewItemIds) {
    const result = await resolveAndMaterializeReviewItem({
      reviewItemId: id,
      shopId: args.shopId,
      userId: args.userId,
      resolutionAction: args.resolutionAction,
      ignoreReasonCode: args.ignoreReasonCode,
      ignoreNote: args.ignoreNote,
    });
    results.push({
      id,
      ok: result.ok,
      ...(result.error ? { error: result.error } : {}),
      appliedResult: {
        reviewItemId: result.item?.id ?? id,
        domain: result.item?.domain ?? null,
        status: result.item?.status ?? null,
        resolutionAction: args.resolutionAction,
        materializedRecord: result.materializedRecord ?? null,
      },
    });
  }
  return results;
}
