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

async function loadProfileBy({ supabase, column, value, label }) {
  const { data, error } = await supabase.from("profiles").select("id, user_id, email").eq(column, value).limit(1).maybeSingle();
  if (error) throw opError("owner_profile_lookup", `profiles.${column}=${value}`, error);
  if (!data?.id) throw new Error(`${label} did not match a profile.`);
  return data;
}

async function loadProfileByEmail({ supabase, email }) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, email, full_name, role, shop_id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (error) throw opError("profile_lookup", `profiles.email=${email}`, error);
  return data ?? null;
}

async function resolveDemoOwner({ supabase, ownerEmail }) {
  const configuredOwnerUserId = process.env.DEMO_OWNER_USER_ID?.trim() || null;
  const configuredOwnerProfileId = process.env.DEMO_OWNER_PROFILE_ID?.trim() || null;
  const configuredOwnerEmail = process.env.DEMO_OWNER_EMAIL?.trim() || null;

  if (configuredOwnerUserId) requireValidUuid(configuredOwnerUserId, "DEMO_OWNER_USER_ID");
  if (configuredOwnerProfileId) requireValidUuid(configuredOwnerProfileId, "DEMO_OWNER_PROFILE_ID");

  if (dryRun) {
    const strategy = configuredOwnerProfileId && configuredOwnerUserId
      ? "DEMO_OWNER_PROFILE_ID+DEMO_OWNER_USER_ID"
      : configuredOwnerProfileId
        ? "DEMO_OWNER_PROFILE_ID"
        : configuredOwnerUserId
          ? "DEMO_OWNER_USER_ID"
          : configuredOwnerEmail
            ? "DEMO_OWNER_EMAIL"
            : "fallback owner@demo.profixiq.local";
    return {
      ownerUserId: configuredOwnerUserId ?? fakeUserIdForEmail(configuredOwnerEmail ?? ownerEmail),
      ownerProfileId: configuredOwnerProfileId ?? configuredOwnerUserId ?? fakeUserIdForEmail(configuredOwnerEmail ?? ownerEmail),
      strategy,
      resolvedOwnerEmail: configuredOwnerEmail ?? ownerEmail,
      authUsersSkipped: true,
      requiresRealOwnerInWriteMode: false,
      realOwnerProfileModified: false,
    };
  }

  let profile;
  let strategy;
  if (configuredOwnerProfileId && configuredOwnerUserId) {
    strategy = "DEMO_OWNER_PROFILE_ID+DEMO_OWNER_USER_ID";
    profile = await loadProfileBy({ supabase, column: "id", value: configuredOwnerProfileId, label: "DEMO_OWNER_PROFILE_ID" });
    if (profile.user_id !== configuredOwnerUserId) {
      throw new Error("DEMO_OWNER_PROFILE_ID and DEMO_OWNER_USER_ID did not match the same auth-linked profile.");
    }
  } else if (configuredOwnerProfileId) {
    strategy = "DEMO_OWNER_PROFILE_ID";
    profile = await loadProfileBy({ supabase, column: "id", value: configuredOwnerProfileId, label: "DEMO_OWNER_PROFILE_ID" });
  } else if (configuredOwnerUserId) {
    strategy = "DEMO_OWNER_USER_ID";
    profile = await loadProfileBy({ supabase, column: "user_id", value: configuredOwnerUserId, label: "DEMO_OWNER_USER_ID" });
  } else if (configuredOwnerEmail) {
    strategy = "DEMO_OWNER_EMAIL";
    profile = await loadProfileBy({ supabase, column: "email", value: configuredOwnerEmail, label: "DEMO_OWNER_EMAIL" });
    if (!isValidUuid(profile.id) || !isValidUuid(profile.user_id)) {
      throw new Error("DEMO_OWNER_EMAIL matched a profile without a valid user_id. Use DEMO_OWNER_PROFILE_ID and DEMO_OWNER_USER_ID for an auth-linked owner.");
    }
  } else {
    strategy = "fallback owner@demo.profixiq.local";
    profile = await loadProfileBy({ supabase, column: "email", value: ownerEmail, label: "owner@demo.profixiq.local fallback" });
  }

  if (!isValidUuid(profile.id) || !isValidUuid(profile.user_id)) {
    throw new Error("Write mode requires an auth-linked owner profile with valid UUID id/user_id.");
  }

  return {
    ownerUserId: profile.user_id,
    ownerProfileId: profile.id,
    strategy,
    resolvedOwnerEmail: profile.email ?? configuredOwnerEmail ?? ownerEmail,
    authUsersSkipped: true,
    requiresRealOwnerInWriteMode: false,
    realOwnerProfileModified: false,
  };
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

const COMPLETED_LINE_STATUSES = new Set(["completed", "done", "closed", "invoiced"]);

function normalizeLineStatus(status) {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

function validateWorkOrderLineCompletedConstraint(line) {
  const normalizedStatus = normalizeLineStatus(line.line_status ?? line.status);
  if (!COMPLETED_LINE_STATUSES.has(normalizedStatus)) return;

  const requiredCompletedFields = ["assigned_tech_id", "punched_in_at", "punched_out_at", "completed_at"];
  const missing = requiredCompletedFields.filter((field) => !line[field]);
  if (missing.length > 0) {
    throw new Error(
      `work_order_line_preflight failed: description=\"${line.description}\" status=${normalizedStatus} missing completed fields: ${missing.join(", ")}`,
    );
  }
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
  const ownerResolution = await resolveDemoOwner({ supabase, ownerEmail });

  logStep(`owner strategy: ${ownerResolution.strategy}`);
  logStep(`resolved owner email: ${ownerResolution.resolvedOwnerEmail}`);
  logStep(`owner_fk_target: shops.owner_id -> profiles.id`);
  logStep(`auth_user_creation: ${ownerResolution.authUsersSkipped ? "skipped" : "enabled"}`);
  logStep(`owner_env_hints: DEMO_OWNER_USER_ID=${process.env.DEMO_OWNER_USER_ID ? "set" : "unset"}, DEMO_OWNER_PROFILE_ID=${process.env.DEMO_OWNER_PROFILE_ID ? "set" : "unset"}, DEMO_OWNER_EMAIL=${process.env.DEMO_OWNER_EMAIL ? "set" : "unset"}`);
  if (ownerResolution.requiresRealOwnerInWriteMode) {
    logStep("write-mode requirement: existing owner profile/auth user required (set DEMO_OWNER_USER_ID or DEMO_OWNER_PROFILE_ID)");
  }

  const shopResult = await upsertByNaturalKey({
    supabase,
    table: "shops",
    match: { slug: DEMO_SHOP.slug },
    payload: {
      ...DEMO_SHOP,
      owner_id: ownerResolution.ownerProfileId,
      created_by: ownerResolution.ownerUserId,
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
  const skippedPersonas = [];
  const assignmentFallbacks = [];
  const intendedPersonaCount = DEMO_USERS.length;
  let createdOrUpdatedProfileCount = 0;
  let realOwnerProfileModified = false;
  for (const [email, full_name, role] of DEMO_USERS) {
    const isResolvedRealOwner = ownerResolution.resolvedOwnerEmail?.toLowerCase() === email.toLowerCase();
    const userId = isResolvedRealOwner ? ownerResolution.ownerUserId : fakeUserIdForEmail(email);
    const profileId = isResolvedRealOwner ? ownerResolution.ownerProfileId : userId;

    if (isResolvedRealOwner) {
      const profile = await upsertByNaturalKey({
        supabase,
        table: "profiles",
        match: { id: profileId },
        payload: { shop_id: shopId },
      });
      profileIds[email] = profile.id ?? profileId;
      profileActions.push(`${profile.action}:real-owner-shop-link-only`);
      createdOrUpdatedProfileCount += 1;
      if (profile.action === "updated" || profile.action === "inserted") realOwnerProfileModified = true;
      continue;
    }

    if (dryRun) {
      profileIds[email] = profileId;
      profileActions.push("dry_run_fake_persona_only");
      continue;
    }

    const existingProfile = await loadProfileByEmail({ supabase, email });
    const hasAuthLinkedIds = isValidUuid(existingProfile?.id) && isValidUuid(existingProfile?.user_id);
    if (!existingProfile || !hasAuthLinkedIds) {
      skippedPersonas.push({ email, reason: "missing auth-linked profile" });
      profileActions.push("skipped:missing auth-linked profile");
      continue;
    }

    const profile = await upsertByNaturalKey({
      supabase,
      table: "profiles",
      match: { email },
      payload: {
        id: existingProfile.id,
        user_id: existingProfile.user_id,
        email,
        full_name,
        role,
        shop_id: shopId,
        phone: "+1-555-010-0000",
        completed_onboarding: true,
      },
    });
    profileIds[email] = profile.id ?? existingProfile.id;
    profileActions.push(profile.action);
    createdOrUpdatedProfileCount += 1;
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
  const vehicleCustomerIds = {};
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
    vehicleCustomerIds[unit] = customerIds[customerName];
  }

  const resolvePersonaId = (email, fieldLabel, { allowNull = false } = {}) => {
    const personaId = profileIds[email];
    if (isValidUuid(personaId)) return personaId;
    if (allowNull) {
      assignmentFallbacks.push({ field: fieldLabel, requested_email: email, fallback: "null", reason: "missing auth-linked profile" });
      return null;
    }
    assignmentFallbacks.push({
      field: fieldLabel,
      requested_email: email,
      fallback: ownerResolution.resolvedOwnerEmail,
      fallback_id: ownerResolution.ownerProfileId,
      reason: "missing auth-linked profile",
    });
    return ownerResolution.ownerProfileId;
  };

  const managerId = resolvePersonaId("manager@demo.profixiq.local", "managerId");
  const advisorId = resolvePersonaId("advisor1@demo.profixiq.local", "advisorId");
  const leadTechId = resolvePersonaId("leadtech@demo.profixiq.local", "leadTechId");
  const tech1Id = resolvePersonaId("tech1@demo.profixiq.local", "tech1Id");
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

  const preflightWorkOrders = workOrders.map(([custom_id, unit, status, notes, approval_state]) => {
    const vehicleId = vehicleIds[unit];
    const vehicleCustomerId = vehicleCustomerIds[unit];

    if (!isValidUuid(vehicleId)) {
      throw new Error(`work_order_preflight failed: ${custom_id} references missing or invalid seeded vehicle for unit ${unit}`);
    }

    if (!isValidUuid(vehicleCustomerId)) {
      throw new Error(`work_order_preflight failed: ${custom_id} unit ${unit} has missing/invalid vehicle.customer_id`);
    }

    const intendedCustomerId = vehicleCustomerId;
    if (intendedCustomerId !== vehicleCustomerId) {
      throw new Error(`work_order_preflight failed: ${custom_id} customer mismatch for unit ${unit} (intended ${intendedCustomerId} vs vehicle ${vehicleCustomerId})`);
    }

    return {
      custom_id,
      unit,
      status,
      notes,
      approval_state,
      vehicleId,
      vehicleCustomerId,
      intendedCustomerId,
    };
  });

  const workOrderIds = {};
  for (const { custom_id, status, notes, approval_state, vehicleId, intendedCustomerId } of preflightWorkOrders) {
    const wo = await upsertByNaturalKey({
      supabase,
      table: "work_orders",
      match: { shop_id: shopId, custom_id },
      payload: {
        shop_id: shopId,
        user_id: advisorId,
        assigned_tech: leadTechId,
        vehicle_id: vehicleId,
        customer_id: intendedCustomerId,
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
    ["DEMO-WO-1003", "Approved steering link replacement", "approved", leadTechId, "active"],
    ["DEMO-WO-1003", "Recommended shock absorbers (deferred)", "declined", leadTechId, "awaiting"],
    ["DEMO-WO-1004", "ABS wheel speed sensor backorder", "pending", tech1Id, "on_hold"],
    ["DEMO-WO-1002", "Pressure test and leak trace", null, tech1Id, "active"],
    ["DEMO-WO-1007", "Wheel seal replacement recurrence", "approved", leadTechId, "active"],
  ];

  for (const [woNumber, description, approval_state, techId, status] of lines) {
    const linePayload = {
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
    };

    validateWorkOrderLineCompletedConstraint(linePayload);

    await upsertByNaturalKey({
      supabase,
      table: "work_order_lines",
      match: { shop_id: shopId, work_order_id: workOrderIds[woNumber], description },
      payload: linePayload,
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
  console.log("vehicle_customer_consistency: passed");
  console.log("work_order_line_constraint_validation: passed");
  console.log("notable_moments: awaiting approval quote split, parts bottleneck, recurring TR-101 repair, completed municipal inspection");
  console.log("portal_seed: skipped (schema/flow ambiguity; follow-up in Phase 2)");
  console.log(`safe_domain_check_non_demo_emails: ${unsafeEmails?.length ?? 0}`);
  console.log(`owner_profile_id: ${ownerResolution.ownerProfileId.slice(0, 8)}...`);
  console.log(`owner_user_id: ${ownerResolution.ownerUserId.slice(0, 8)}...`);
  console.log(`real_owner_profile_modified: ${(ownerResolution.realOwnerProfileModified || realOwnerProfileModified) ? "yes" : "no"}`);
  console.log(`intended_persona_count: ${intendedPersonaCount}`);
  console.log(`created_or_updated_profile_count: ${createdOrUpdatedProfileCount}`);
  console.log(`skipped_persona_count: ${skippedPersonas.length}`);
  console.log(`skipped_personas: ${JSON.stringify(skippedPersonas)}`);
  console.log(`assignment_fallbacks: ${JSON.stringify(assignmentFallbacks)}`);
  if (dryRun) {
    console.log("dry_run_note: fake persona IDs are dry-run only; write mode requires existing auth-linked profiles.");
  }
  console.log("auth_user_creation: skipped (profiles-only safe path)");
  console.log("storage_urls: none seeded by script");
}

main().catch((error) => {
  console.error("Demo seed failed:", error.message);
  process.exit(1);
});
