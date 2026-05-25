import { createClient } from "@supabase/supabase-js";

const DEMO_SHOP = {
  slug: "prairie-fleet-diesel-demo",
  name: "Prairie Fleet & Diesel Demo",
  business_name: "Prairie Fleet & Diesel Demo",
  city: "Calgary",
  province: "AB",
  timezone: "America/Edmonton",
  street: "100 Demo Yard Way",
  address: "100 Demo Yard Way",
  postal_code: "T2P 0A1",
  phone_number: "+1-555-010-1000",
  email: "contact@demo.profixiq.local",
  plan: "pro",
};

const DEMO_USERS = [
  ["owner@demo.profixiq.local", "Owner Demo", "owner"],
  ["admin@demo.profixiq.local", "Admin Demo", "admin"],
  ["manager@demo.profixiq.local", "Manager Demo", "manager"],
  ["advisor1@demo.profixiq.local", "Advisor One", "advisor"],
  ["advisor2@demo.profixiq.local", "Advisor Two", "advisor"],
  ["leadtech@demo.profixiq.local", "Lead Tech", "tech"],
  ["tech1@demo.profixiq.local", "Tech One", "tech"],
  ["tech2@demo.profixiq.local", "Tech Two", "tech"],
  ["parts@demo.profixiq.local", "Parts Coordinator", "parts"],
  ["payroll@demo.profixiq.local", "Payroll Coordinator", "manager"],
];

const dryRun = String(process.env.DEMO_SEED_DRY_RUN || "false").toLowerCase() === "true";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function logStep(msg) {
  console.log(`\n[seed-demo-shop] ${msg}`);
}

function fakeUserIdForEmail(email) {
  const hex = Buffer.from(email).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function fakeUuidFromKey(key) {
  const hex = Buffer.from(String(key)).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function requireValidUuid(value, label) {
  if (!isValidUuid(value)) {
    throw new Error(`${label} must be a valid UUID, received: ${value === null ? "null" : String(value)}`);
  }
}

function opError(operation, details, error) {
  const message = error?.message || "unknown Supabase error";
  return new Error(`${operation} failed (${details}): ${message}`);
}

async function upsertByNaturalKey({ supabase, table, match, payload, select = "id" }) {
  const query = supabase.from(table).select(select).limit(1);
  for (const [key, value] of Object.entries(match)) query.eq(key, value);
  const { data: existing, error: lookupError } = await query.maybeSingle();
  if (lookupError) throw opError("lookup", `table=${table} match=${JSON.stringify(match)}`, lookupError);

  if (existing?.id) {
    if (!dryRun) {
      const { error } = await supabase.from(table).update(payload).eq("id", existing.id);
      if (error) throw opError("update", `table=${table} id=${existing.id}`, error);
    }
    return { id: existing.id, action: "updated" };
  }

  if (dryRun) {
    return { id: fakeUuidFromKey(`${table}:${JSON.stringify(match)}`), action: "would_insert" };
  }

  const { data: inserted, error: insertError } = await supabase
    .from(table)
    .insert(payload)
    .select(select)
    .limit(1)
    .maybeSingle();
  if (insertError) throw opError("insert", `table=${table} match=${JSON.stringify(match)}`, insertError);
  return { id: inserted?.id ?? null, action: "inserted" };
}

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("Refusing to run: set ALLOW_DEMO_SEED=true to seed demo/beta data.");
    process.exit(1);
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  logStep(`Starting ${dryRun ? "DRY RUN" : "WRITE MODE"}`);

  const ownerEmail = "owner@demo.profixiq.local";
  const ownerUserId = fakeUserIdForEmail(ownerEmail);

  const shopResult = await upsertByNaturalKey({
    supabase,
    table: "shops",
    match: { slug: DEMO_SHOP.slug },
    payload: {
      ...DEMO_SHOP,
      owner_id: ownerUserId,
      created_by: ownerUserId,
      shop_name: DEMO_SHOP.name,
      use_ai: true,
      require_authorization: true,
    },
  });

  const shopId = shopResult.id;
  requireValidUuid(shopId, "shopId");
  if (!shopId && !dryRun) throw new Error("Failed to resolve demo shop id");
  logStep(`Shop ${shopResult.action}: ${DEMO_SHOP.name}`);

  const profileActions = [];
  const profileIds = {};
  for (const [email, full_name, role] of DEMO_USERS) {
    const userId = fakeUserIdForEmail(email);
    const profile = await upsertByNaturalKey({
      supabase,
      table: "profiles",
      match: { email },
      payload: {
        id: userId,
        user_id: userId,
        email,
        full_name,
        role,
        shop_id: shopId,
        phone: "+1-555-010-0000",
        completed_onboarding: true,
      },
    });
    profileIds[email] = profile.id ?? userId;
    profileActions.push(profile.action);
  }

  const customers = [
    ["North Ridge Logistics Ltd.", "fleet", "dispatch@northridge.demo.profixiq.local", "+1-555-010-2001"],
    ["Foothills Municipal Services", "fleet", "fleetdesk@foothills.demo.profixiq.local", "+1-555-010-2002"],
    ["Summit Construction Services", "commercial", "ops@summit.demo.profixiq.local", "+1-555-010-2003"],
  ];

  const customerIds = {};
  for (const [name, type, email, phone] of customers) {
    const customer = await upsertByNaturalKey({
      supabase,
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

  const assets = [
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

  const customerMap = {
    north: "North Ridge Logistics Ltd.",
    foothills: "Foothills Municipal Services",
    summit: "Summit Construction Services",
  };

  const vehicleIds = {};
  for (const [unit, year, make, model, vin, plate, customerKey] of assets) {
    const customerName = customerMap[customerKey];
    const vehicle = await upsertByNaturalKey({
      supabase,
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
        mileage: String(120000 + Object.keys(vehicleIds).length * 8500),
        engine_hours: 2500 + Object.keys(vehicleIds).length * 175,
      },
    });
    vehicleIds[unit] = vehicle.id;
  }

  const managerId = profileIds["manager@demo.profixiq.local"];
  const advisorId = profileIds["advisor1@demo.profixiq.local"];
  const leadTechId = profileIds["leadtech@demo.profixiq.local"];
  const tech1Id = profileIds["tech1@demo.profixiq.local"];
  requireValidUuid(managerId, "managerId");
  requireValidUuid(advisorId, "advisorId");
  requireValidUuid(leadTechId, "leadTechId");
  requireValidUuid(tech1Id, "tech1Id");

  const workOrders = [
    ["DEMO-WO-1001", "TR-101", "new", "Routine PM and brake noise check", "pending"],
    ["DEMO-WO-1002", "TR-102", "in_progress", "Coolant leak diagnostics", "pending"],
    ["DEMO-WO-1003", "TR-103", "awaiting_approval", "Front suspension rebuild quote", "pending"],
    ["DEMO-WO-1004", "TL-202", "awaiting", "ABS fault, waiting for parts", "pending"],
    ["DEMO-WO-1005", "SV-301", "queued", "Hydraulic line replacement", "approved"],
    ["DEMO-WO-1006", "MU-401", "completed", "Annual municipal safety inspection", "approved"],
    ["DEMO-WO-1007", "TR-101", "completed", "Repeat wheel-seal and brake contamination", "approved"],
  ];

  const workOrderIds = {};
  for (const [custom_id, unit, status, notes, approval_state] of workOrders) {
    const wo = await upsertByNaturalKey({
      supabase,
      table: "work_orders",
      match: { shop_id: shopId, custom_id },
      payload: {
        shop_id: shopId,
        user_id: advisorId,
        assigned_tech: leadTechId,
        vehicle_id: vehicleIds[unit],
        customer_id: customerIds[unit.startsWith("MU") ? "Foothills Municipal Services" : unit.startsWith("SV") || unit === "TR-103" ? "Summit Construction Services" : "North Ridge Logistics Ltd."],
        custom_id,
        status,
        type: "repair",
        notes,
        approval_state,
      },
    });
    workOrderIds[custom_id] = wo.id;
  }

  const lines = [
    ["DEMO-WO-1003", "Approved steering link replacement", "approved", leadTechId, "completed"],
    ["DEMO-WO-1003", "Recommended shock absorbers (deferred)", "declined", leadTechId, "awaiting"],
    ["DEMO-WO-1004", "ABS wheel speed sensor backorder", "pending", tech1Id, "on_hold"],
    ["DEMO-WO-1002", "Pressure test and leak trace", null, tech1Id, "in_progress"],
    ["DEMO-WO-1007", "Wheel seal replacement recurrence", "approved", leadTechId, "completed"],
  ];

  for (const [woNumber, description, approval_state, techId, status] of lines) {
    await upsertByNaturalKey({
      supabase,
      table: "work_order_lines",
      match: { shop_id: shopId, work_order_id: workOrderIds[woNumber], description },
      payload: {
        shop_id: shopId,
        work_order_id: workOrderIds[woNumber],
        user_id: managerId,
        assigned_to: techId,
        assigned_tech_id: techId,
        description,
        complaint: description,
        cause: "Demo seeded narrative cause",
        correction: "Demo seeded narrative correction",
        line_status: status,
        status,
        job_type: "repair",
        approval_state,
        labor_time: 1.5,
        parts_required: [{ part: "Demo Part", qty: 1 }],
      },
    });
  }

  const inspections = [
    ["DEMO-WO-1003", "in_progress", "Suspension inspection found urgent steering wear", false],
    ["DEMO-WO-1006", "completed", "Municipal unit passed, minor recommendations logged", true],
  ];

  for (const [woNumber, status, notes, completed] of inspections) {
    await upsertByNaturalKey({
      supabase,
      table: "inspections",
      match: { shop_id: shopId, work_order_id: workOrderIds[woNumber], inspection_type: "digital_dvir" },
      payload: {
        shop_id: shopId,
        user_id: tech1Id,
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
      },
    });
  }

  const tablesToCount = ["profiles", "customers", "vehicles", "work_orders", "inspections"];
  const counts = {};
  for (const table of tablesToCount) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("shop_id", shopId);
    if (error) throw opError("count", `table=${table} shop_id=${shopId}`, error);
    counts[table] = count ?? 0;
  }

  const { data: unsafeEmails, error: unsafeErr } = await supabase
    .from("profiles")
    .select("email")
    .eq("shop_id", shopId)
    .not("email", "like", "%@demo.profixiq.local");
  if (unsafeErr) throw opError("safe_domain_check", `table=profiles shop_id=${shopId}`, unsafeErr);

  console.log("\n=== Demo seed summary ===");
  console.log(`shop_id: ${shopId ?? "dry-run"}`);
  console.log(`profile_count: ${counts.profiles}`);
  console.log(`customer_count: ${counts.customers}`);
  console.log(`vehicle_count: ${counts.vehicles}`);
  console.log(`work_order_count: ${counts.work_orders}`);
  console.log(`inspection_count: ${counts.inspections}`);
  console.log("notable_moments: awaiting approval quote split, parts bottleneck, recurring TR-101 repair, completed municipal inspection");
  console.log("portal_seed: skipped (schema/flow ambiguity; follow-up in Phase 2)");
  console.log(`safe_domain_check_non_demo_emails: ${unsafeEmails?.length ?? 0}`);
  console.log("auth_user_creation: skipped (profiles-only safe path)");
  console.log("storage_urls: none seeded by script");
}

main().catch((error) => {
  console.error("Demo seed failed:", error.message);
  process.exit(1);
});
