import { createClient } from "@supabase/supabase-js";

const DEFAULT_SHOP_SLUG = "prairie-fleet-diesel-demo";
const DEFAULT_OWNER_EMAIL = "edwardlakin35@gmail.com";
const DEMO_DOMAIN_SUFFIX = ".demo.profixiq.local";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function isDemoSafeEmail(email) {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@demo.profixiq.local`) || normalized.endsWith(DEMO_DOMAIN_SUFFIX);
}

function hasPublicStorageUrl(value) {
  if (value == null) return false;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized.includes("supabase.co/storage/v1/object/public/") || normalized.includes("/storage/v1/object/public/");
  }
  if (Array.isArray(value)) return value.some((item) => hasPublicStorageUrl(item));
  if (typeof value === "object") return Object.values(value).some((item) => hasPublicStorageUrl(item));
  return false;
}

async function countByShop(supabase, table, shopId) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  if (error) throw new Error(`Count failed for ${table}: ${error.message}`);
  return count ?? 0;
}

function addCheck(checks, failures, name, pass, details = {}) {
  checks.push({ name, pass, ...details });
  if (!pass) failures.push({ name, ...details });
}

async function main() {
  if (process.env.ALLOW_DEMO_SEED_QA !== "true") {
    console.error("Refusing to run: set ALLOW_DEMO_SEED_QA=true.");
    process.exit(1);
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const shopSlug = (process.env.DEMO_SHOP_SLUG || DEFAULT_SHOP_SLUG).trim();
  const ownerEmail = (process.env.DEMO_OWNER_EMAIL || DEFAULT_OWNER_EMAIL).trim().toLowerCase();

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  const checks = [];
  const failures = [];

  const { data: shops, error: shopError } = await supabase
    .from("shops")
    .select("id, slug, name, owner_id")
    .or(`slug.eq.${shopSlug},name.eq.${shopSlug}`)
    .limit(5);

  if (shopError) throw new Error(`Shop lookup failed: ${shopError.message}`);

  addCheck(checks, failures, "exactly_one_demo_shop_found", (shops?.length ?? 0) === 1, { found: shops?.length ?? 0, shopSlug });

  const shop = shops?.[0];
  const shopId = shop?.id ?? null;

  const counts = {
    customers: 0,
    vehicles: 0,
    work_orders: 0,
    inspections: 0,
    work_order_lines: 0,
  };

  if (shopId) {
    counts.customers = await countByShop(supabase, "customers", shopId);
    counts.vehicles = await countByShop(supabase, "vehicles", shopId);
    counts.work_orders = await countByShop(supabase, "work_orders", shopId);
    counts.inspections = await countByShop(supabase, "inspections", shopId);
    counts.work_order_lines = await countByShop(supabase, "work_order_lines", shopId);
  }

  addCheck(checks, failures, "customer_count_is_3", counts.customers === 3, { actual: counts.customers, expected: 3 });
  addCheck(checks, failures, "vehicle_count_is_10", counts.vehicles === 10, { actual: counts.vehicles, expected: 10 });
  addCheck(checks, failures, "work_order_count_is_7", counts.work_orders === 7, { actual: counts.work_orders, expected: 7 });
  addCheck(checks, failures, "inspection_count_is_2", counts.inspections === 2, { actual: counts.inspections, expected: 2 });
  addCheck(checks, failures, "work_order_line_count_min_6", counts.work_order_lines >= 6, { actual: counts.work_order_lines, expectedMin: 6 });

  const tablesForShopBoundary = ["customers", "vehicles", "work_orders", "inspections", "work_order_lines", "profiles"];
  for (const table of tablesForShopBoundary) {
    if (!shopId) break;
    const { data, error } = await supabase.from(table).select("shop_id").eq("shop_id", shopId).limit(1);
    if (error) throw new Error(`shop_id boundary check failed for ${table}: ${error.message}`);
    addCheck(checks, failures, `shop_id_boundary_${table}`, (data?.[0]?.shop_id ?? null) === shopId, { table, shopId });
  }

  if (shopId) {
    const { data: workOrders, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id, custom_id, shop_id, customer_id, vehicle_id, status, notes, approval_state")
      .eq("shop_id", shopId);
    if (workOrderError) throw new Error(`work order readback failed: ${workOrderError.message}`);

    const { data: vehicles, error: vehiclesError } = await supabase
      .from("vehicles")
      .select("id, shop_id, customer_id, unit_number")
      .eq("shop_id", shopId);
    if (vehiclesError) throw new Error(`vehicle readback failed: ${vehiclesError.message}`);

    const vehicleById = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));
    const mismatchedVehicleCustomer = (workOrders ?? []).filter((workOrder) => {
      const vehicle = vehicleById.get(workOrder.vehicle_id);
      if (!vehicle) return true;
      return vehicle.customer_id !== workOrder.customer_id;
    });
    addCheck(checks, failures, "work_order_vehicle_customer_consistency", mismatchedVehicleCustomer.length === 0, {
      mismatchCount: mismatchedVehicleCustomer.length,
      mismatchedWorkOrders: mismatchedVehicleCustomer.map((workOrder) => workOrder.custom_id),
    });

    const storageScan = [];
    for (const workOrder of workOrders ?? []) {
      storageScan.push(workOrder.notes);
    }

    const { data: inspections, error: inspectionError } = await supabase
      .from("inspections")
      .select("id, shop_id, notes, summary, inspection_type, status")
      .eq("shop_id", shopId);
    if (inspectionError) throw new Error(`inspection readback failed: ${inspectionError.message}`);

    for (const inspection of inspections ?? []) {
      storageScan.push(inspection.notes, inspection.summary);
    }

    const { data: lines, error: lineError } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, shop_id, description, complaint, cause, correction, parts_required, status, approval_state, labor_time, punched_out_at")
      .eq("shop_id", shopId);
    if (lineError) throw new Error(`work_order_lines readback failed: ${lineError.message}`);

    for (const line of lines ?? []) {
      storageScan.push(line.description, line.complaint, line.cause, line.correction, line.parts_required);
    }



    const woById = new Map((workOrders ?? []).map((wo) => [wo.id, wo]));
    const linesByCustomId = new Map();
    for (const ln of lines ?? []) {
      const customId = woById.get(ln.work_order_id)?.custom_id ?? null;
      if (!customId) continue;
      if (!linesByCustomId.has(customId)) linesByCustomId.set(customId, []);
      linesByCustomId.get(customId).push(ln);
    }

    for (const wo of workOrders ?? []) {
      if (wo.custom_id === "DEMO-WO-1005") continue;
      addCheck(checks, failures, `visible_lines_${wo.custom_id}`, (linesByCustomId.get(wo.custom_id)?.length ?? 0) > 0, { custom_id: wo.custom_id });
    }

    const nonZeroLaborOrLine = (lines ?? []).some((ln) => Number(ln.labor_time ?? 0) > 0);
    addCheck(checks, failures, "line_has_non_zero_labor_or_total", nonZeroLaborOrLine, {});

    const demo1003Lines = linesByCustomId.get("DEMO-WO-1003") ?? [];
    const demo1003HasAwaiting = demo1003Lines.some((ln) => String(ln.approval_state ?? "").toLowerCase() === "pending" || String(ln.status ?? "").toLowerCase() === "awaiting_approval");
    const demo1003HasDeferred = demo1003Lines.some((ln) => ["declined", "deferred"].includes(String(ln.approval_state ?? ln.status ?? "").toLowerCase()) || String(ln.status ?? "").toLowerCase() === "deferred");
    addCheck(checks, failures, "approval_split_lines_exist", demo1003HasAwaiting && demo1003HasDeferred, {});

    const hasPartsBottleneckLine = (linesByCustomId.get("DEMO-WO-1004") ?? []).some((ln) => String(ln.status ?? "").toLowerCase() === "waiting_parts");
    addCheck(checks, failures, "parts_bottleneck_line_exists", hasPartsBottleneckLine, {});

    const hasRecurringTr101Line = (linesByCustomId.get("DEMO-WO-1007") ?? []).some((ln) => (ln.description || "").toLowerCase().includes("wheel seal"));
    addCheck(checks, failures, "recurring_tr101_line_exists", hasRecurringTr101Line, {});

    const invalidCompleted = (lines ?? []).filter((ln) => ["completed", "ready_to_invoice", "invoiced"].includes(String(ln.status ?? "").toLowerCase()) && !ln.punched_out_at);
    addCheck(checks, failures, "completed_like_lines_have_completion_fields", invalidCompleted.length === 0, { invalidCount: invalidCompleted.length });
    addCheck(checks, failures, "no_public_storage_urls_found", !storageScan.some((item) => hasPublicStorageUrl(item)), {});

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, user_id, email, full_name, role, shop_id")
      .eq("shop_id", shopId);
    if (profilesError) throw new Error(`profiles readback failed: ${profilesError.message}`);

    const disallowedEmails = (profiles ?? [])
      .map((profile) => (profile.email || "").toLowerCase())
      .filter((email) => email && !isDemoSafeEmail(email) && email !== ownerEmail);
    addCheck(checks, failures, "safe_email_hygiene", disallowedEmails.length === 0, { disallowedEmails, allowedNonDemoEmail: ownerEmail });

    const ownerProfile = (profiles ?? []).find((profile) => (profile.email || "").toLowerCase() === ownerEmail);
    addCheck(checks, failures, "owner_profile_exists", Boolean(ownerProfile), { ownerEmail });

    const seededPersonaNames = new Set([
      "Demo Owner",
      "Owner Demo",
      "Prairie Demo Owner",
      "Admin Demo",
      "Manager Demo",
      "Advisor One",
      "Advisor Two",
      "Lead Tech",
      "Tech One",
      "Tech Two",
      "Parts Coordinator",
      "Payroll Coordinator",
    ]);

    const overwriteSignals = [];
    const ownerProfileEmail = (ownerProfile?.email || "").trim().toLowerCase();
    const ownerFullName = (ownerProfile?.full_name || ownerProfile?.name || "").trim();
    const ownerRole = (ownerProfile?.role || "").trim().toLowerCase();

    if (ownerProfileEmail && ownerProfileEmail !== ownerEmail && isDemoSafeEmail(ownerProfileEmail)) {
      overwriteSignals.push(`owner_email_replaced_with_demo_safe:${ownerProfileEmail}`);
    }

    if (ownerFullName && seededPersonaNames.has(ownerFullName)) {
      overwriteSignals.push(`owner_name_matches_seeded_persona:${ownerFullName}`);
    }

    if (/\bdemo\b/i.test(ownerFullName) && ownerFullName.toLowerCase() !== "edward lakin") {
      overwriteSignals.push(`owner_name_contains_demo_marker:${ownerFullName}`);
    }

    const ownerNotPersona = Boolean(ownerProfile) && overwriteSignals.length === 0;
    addCheck(checks, failures, "owner_profile_not_overwritten_to_persona", ownerNotPersona, {
      ownerEmail: ownerProfileEmail || null,
      ownerFullName: ownerFullName || null,
      ownerRole: ownerRole || null,
      overwriteSignals,
    });

    addCheck(checks, failures, "portal_depth_absent_phase_1", true, {
      note: "Portal seed intentionally skipped in Phase 1 by design.",
    });

    const hasAwaitingApprovalSplit = (workOrders ?? []).some(
      (wo) => wo.custom_id === "DEMO-WO-1003" && wo.status === "awaiting_approval" && wo.approval_state === "pending",
    );
    addCheck(checks, failures, "moment_awaiting_approval_quote_split", hasAwaitingApprovalSplit, {});

    const hasPartsBottleneck = (workOrders ?? []).some((wo) => wo.custom_id === "DEMO-WO-1004" && wo.notes?.toLowerCase().includes("waiting for parts"));
    addCheck(checks, failures, "moment_parts_bottleneck", hasPartsBottleneck, {});

    const hasRecurringTR101 = (workOrders ?? []).some(
      (wo) => wo.custom_id === "DEMO-WO-1007" && wo.notes?.toLowerCase().includes("repeat") && vehicleById.get(wo.vehicle_id)?.unit_number === "TR-101",
    );
    addCheck(checks, failures, "moment_recurring_tr_101_repair", hasRecurringTR101, {});

    const hasMunicipalInspection = (inspections ?? []).some(
      (inspection) => inspection.notes?.toLowerCase().includes("municipal inspection ready for advisor review"),
    );
    addCheck(checks, failures, "moment_municipal_inspection_ready_for_review", hasMunicipalInspection, {});
  }

  const summary = {
    ok: failures.length === 0,
    shopId,
    counts,
    checks,
    failures,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((error) => {
  const summary = {
    ok: false,
    shopId: null,
    counts: {},
    checks: [],
    failures: [{ name: "runtime_error", message: error.message }],
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(1);
});
