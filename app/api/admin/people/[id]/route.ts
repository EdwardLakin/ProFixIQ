import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { getShopScheduleDateContext } from "@/features/workforce/lib/schedulePosture";
import {
  addScheduleDateKeyDays,
  isValidScheduleDateKey,
  scheduleDateKeyDistance,
} from "@/features/workforce/lib/scheduleValidation";

type Ctx = { params: Promise<{ id: string }> };
type ActionSeverity = "blocking" | "warning" | "informational";
type ActionReason = { code: string; severity: ActionSeverity; label: string; action_label: string; action_href: string };
type AdminClient = ReturnType<typeof createAdminSupabase>;

type WorkforceProfilePayload = {
  workforce_role?: string | null;
  workforce_category?: string | null;
  employment_status?: "active" | "inactive" | "on_leave" | null;
  start_date?: string | null;
  payroll_ready?: boolean | null;
  notes?: string | null;
};

type PersonUpdatePayload = {
  full_name?: string | null;
  phone?: string | null;
  role?: string | null;
  completed_onboarding?: boolean;
  workforce_profile?: WorkforceProfilePayload;
};

function normalizeOptionalText(
  value: unknown,
  label: string,
  maxLength: number,
  options: { requireValue?: boolean } = {},
):
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) {
    return options.requireValue
      ? { ok: false, error: `${label} is required` }
      : { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be text` };
  }
  const normalized = value.trim();
  if (!normalized) {
    return options.requireValue
      ? { ok: false, error: `${label} is required` }
      : { ok: true, value: null };
  }
  if (normalized.length > maxLength) {
    return {
      ok: false,
      error: `${label} must be ${maxLength} characters or fewer`,
    };
  }
  return { ok: true, value: normalized };
}

function auditMetadataShopId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>).shop_id;
  return typeof value === "string" ? value : null;
}

async function assertTarget(admin: AdminClient, shopId: string, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, user_id, shop_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    return { ok: false, message: error.message, status: 500 } as const;
  }
  if (!data || data.shop_id !== shopId) {
    return {
      ok: false,
      message: "Person not found in this shop",
      status: 404,
    } as const;
  }
  return { ok: true, profile: data } as const;
}

export async function GET(_req: NextRequest, context: unknown) {
  const { id: personId } = await (context as Ctx).params;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const check = await assertTarget(admin, access.profile.shop_id!, personId);
  if (!check.ok) {
    return NextResponse.json(
      { error: check.message },
      { status: check.status },
    );
  }
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", access.profile.shop_id)
    .maybeSingle();
  if (shopError) {
    return NextResponse.json({ error: shopError.message }, { status: 500 });
  }
  const todayDateKey = getShopScheduleDateContext(
    new Date(),
    shop?.timezone,
  ).dateKey;

  const [
    { data: person, error: pErr },
    { data: workforce, error: workforceErr },
    { data: certs, error: certsErr },
    { data: documents, error: documentsErr },
    { count: openEntriesCount, error: entriesErr },
    { data: openExceptions, error: exceptionsErr },
    { data: scheduleTemplates, error: templatesErr },
    { data: scheduleOverrides, error: overridesErr },
    { data: upcomingAwayBlocks, error: awayErr },
    { data: timeOffRequests, error: timeOffErr },
    { data: auditProfiles, error: auditProfilesErr },
  ] = await Promise.all([
    admin.from("profiles").select("id, user_id, full_name, username, email, phone, role, completed_onboarding, created_at, last_active_at").eq("id", personId).maybeSingle(),
    admin
      .from("people_workforce_profiles")
      .select("workforce_role, workforce_category, employment_status, start_date, payroll_ready, notes")
      .eq("shop_id", access.profile.shop_id)
      .eq("user_id", personId)
      .maybeSingle(),
    admin
      .from("staff_certifications")
      .select("id, cert_type, cert_name, cert_number, issuing_body, issue_date, expiry_date, status, notes")
      .eq("shop_id", access.profile.shop_id)
      .eq("user_id", personId)
      .order("created_at", { ascending: false }),
    admin
      .from("employee_documents")
      .select(
        "id, doc_type, status, uploaded_at, expires_at, original_filename, content_type, file_size_bytes",
      )
      .eq("shop_id", access.profile.shop_id)
      .eq("user_id", personId)
      .order("uploaded_at", { ascending: false }),
    admin
      .from("payroll_time_entries")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", access.profile.shop_id)
      .eq("user_id", personId)
      .in("approval_state", ["draft", "reviewed"]),
    admin.from("payroll_time_exceptions").select("severity, resolved").eq("shop_id", access.profile.shop_id).eq("user_id", personId).eq("resolved", false),
    admin.from("staff_schedule_templates").select("id, day_of_week, start_time, end_time, is_working_day").eq("shop_id", access.profile.shop_id).eq("user_id", personId),
    admin.from("staff_schedule_overrides").select("id, schedule_date, start_time, end_time, status").eq("shop_id", access.profile.shop_id).eq("user_id", personId).gte("schedule_date", todayDateKey).neq("status", "cancelled").order("schedule_date", { ascending: true }).limit(14),
    admin.from("staff_availability_blocks").select("id, starts_at, ends_at, block_type, label").eq("shop_id", access.profile.shop_id).eq("user_id", personId).gte("ends_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(14),
    admin.from("staff_time_off_requests").select("id, status, starts_at, ends_at, request_type, reason").eq("shop_id", access.profile.shop_id).eq("user_id", personId).order("created_at", { ascending: false }).limit(14),
    admin.from("profiles").select("id, user_id, full_name, username, email").eq("shop_id", access.profile.shop_id),
  ]);

  if (pErr || !person) return NextResponse.json({ error: pErr?.message ?? "Person not found" }, { status: 404 });
  const relatedDataError =
    workforceErr ??
    certsErr ??
    documentsErr ??
    entriesErr ??
    exceptionsErr ??
    templatesErr ??
    overridesErr ??
    awayErr ??
    timeOffErr ??
    auditProfilesErr;
  if (relatedDataError) {
    return NextResponse.json(
      { error: relatedDataError.message },
      { status: 500 },
    );
  }

  const personActorIds = [personId, check.profile.user_id].filter(
    (value): value is string => Boolean(value),
  );
  const [
    { data: targetAudit, error: targetAuditErr },
    { data: actorAudit, error: actorAuditErr },
  ] = await Promise.all([
    admin
      .from("audit_logs")
      .select("id, action, created_at, target, metadata, actor_id")
      .eq("target", personId)
      .order("created_at", { ascending: false })
      .limit(24),
    personActorIds.length
      ? admin
          .from("audit_logs")
          .select("id, action, created_at, target, metadata, actor_id")
          .contains("metadata", { shop_id: access.profile.shop_id })
          .in("actor_id", personActorIds)
          .order("created_at", { ascending: false })
          .limit(24)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (targetAuditErr || actorAuditErr) {
    return NextResponse.json(
      {
        error:
          targetAuditErr?.message ??
          actorAuditErr?.message ??
          "Unable to load person activity",
      },
      { status: 500 },
    );
  }
  const audit = [
    ...new Map(
      [
        ...(targetAudit ?? []).filter((row) => {
          const metadataShopId = auditMetadataShopId(row.metadata);
          return (
            metadataShopId === null ||
            metadataShopId === access.profile.shop_id
          );
        }),
        ...(actorAudit ?? []),
      ].map((row) => [row.id, row]),
    ).values(),
  ]
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 12);

  const auditActorNameById = new Map<string, string>();
  for (const actor of auditProfiles ?? []) {
    const actorName =
      actor.full_name?.trim() ||
      actor.username?.trim() ||
      actor.email?.trim() ||
      "Former employee";
    auditActorNameById.set(actor.id, actorName);
    if (actor.user_id) auditActorNameById.set(actor.user_id, actorName);
  }

  const blocking = (openExceptions ?? []).filter((row) => row.severity === "blocking").length;
  const warning = (openExceptions ?? []).filter((row) => row.severity === "warning").length;
  const profile = workforce ?? {
    workforce_role: null,
    workforce_category: null,
    employment_status: "active",
    start_date: null,
    payroll_ready: false,
    notes: null,
  };

  const expiringSoonDateKey = addScheduleDateKeyDays(todayDateKey, 30);
  const certifications = (certs ?? []).map((cert) => {
    const expiryDateKey = cert.expiry_date?.slice(0, 10) ?? null;
    const isExpired =
      cert.status === "expired" ||
      Boolean(expiryDateKey && expiryDateKey < todayDateKey);
    const daysRemaining = expiryDateKey
      ? scheduleDateKeyDistance(todayDateKey, expiryDateKey)
      : null;
    let lifecycle_group: "expired" | "expiring_soon" | "active";
    if (isExpired) lifecycle_group = "expired";
    else if (expiryDateKey && expiryDateKey <= expiringSoonDateKey) lifecycle_group = "expiring_soon";
    else lifecycle_group = "active";
    return { ...cert, days_remaining: daysRemaining, lifecycle_group };
  });

  const reasons: ActionReason[] = [];
  if (blocking > 0) {
    reasons.push({
      code: "payroll_blocking_exceptions",
      severity: "blocking",
      label: `${blocking} payroll blocking issue${blocking > 1 ? "s" : ""}`,
      action_label: "Review payroll entries",
      action_href: `/dashboard/workforce/payroll-review?person_id=${personId}`,
    });
  }
  if (!profile.payroll_ready) {
    const hasRecordedPayrollEvidence = (openEntriesCount ?? 0) > 0;
    reasons.push({
      code: "payroll_not_ready",
      severity: hasRecordedPayrollEvidence ? "blocking" : "warning",
      label: hasRecordedPayrollEvidence
        ? "Recorded time is blocked by incomplete payroll setup"
        : "Payroll setup is incomplete",
      action_label: "Fix payroll data",
      action_href: `/dashboard/workforce/people/${personId}#workforce`,
    });
  }
  const missingWorkforceData = [
    !profile.workforce_role ? "Workforce role" : null,
    !profile.start_date ? "Start date" : null,
    !person.phone ? "Phone number" : null,
  ].filter(Boolean) as string[];
  if (missingWorkforceData.length > 0) {
    reasons.push({
      code: "workforce_profile_missing",
      severity: "warning",
      label: `Profile details to complete: ${missingWorkforceData.join(", ")}`,
      action_label: "Complete workforce profile",
      action_href: `/dashboard/workforce/people/${personId}#workforce`,
    });
  }
  const expiredCount = certifications.filter((cert) => cert.lifecycle_group === "expired").length;
  if (expiredCount > 0) {
    reasons.push({
      code: "cert_expired",
      severity: "blocking",
      label: `${expiredCount} certification${expiredCount > 1 ? "s are" : " is"} expired`,
      action_label: "Update certification",
      action_href: `/dashboard/workforce/people/${personId}#certifications`,
    });
  }
  const expiringSoonCount = certifications.filter((cert) => cert.lifecycle_group === "expiring_soon").length;
  if (expiringSoonCount > 0) {
    reasons.push({
      code: "cert_expiring_soon",
      severity: "warning",
      label: `${expiringSoonCount} certification${expiringSoonCount > 1 ? "s" : ""} expiring soon`,
      action_label: "Renew certification",
      action_href: `/dashboard/workforce/people/${personId}#certifications`,
    });
  }
  if (warning > 0) {
    reasons.push({
      code: "payroll_warning_exceptions",
      severity: "warning",
      label: `${warning} payroll warning${warning > 1 ? "s" : ""}`,
      action_label: "Review payroll entries",
      action_href: `/dashboard/workforce/payroll-review?person_id=${personId}`,
    });
  }
  if (profile.employment_status === "inactive" && (openEntriesCount ?? 0) > 0) {
    reasons.push({
      code: "inactive_in_payroll_scope",
      severity: "informational",
      label: "Inactive employee still has open payroll entries",
      action_label: "Review payroll entries",
      action_href: `/dashboard/workforce/payroll-review?person_id=${personId}`,
    });
  }

  const prioritizedAudit = (audit ?? [])
    .map((row) => {
      const action = (row.action ?? "").toLowerCase();
      const priority = action.includes("employment") || action.includes("role")
        ? 3
        : action.includes("cert")
          ? 2
          : action.includes("payroll")
            ? 2
            : 1;
      return {
        ...row,
        actor_name: row.actor_id
          ? auditActorNameById.get(row.actor_id) ?? "Former employee"
          : "System",
        affected_person_name:
          person.full_name?.trim() ||
          person.username?.trim() ||
          person.email?.trim() ||
          "Employee profile unavailable",
        priority,
      };
    })
    .sort((a, b) => (b.priority - a.priority) || ((new Date(b.created_at ?? 0).getTime()) - (new Date(a.created_at ?? 0).getTime())));

  return NextResponse.json({
    ...person,
    workforce_profile: profile,
    certifications,
    documents: documents ?? [],
    needs_action: reasons.length > 0,
    action_reasons: reasons,
    action_counts: {
      blocking: reasons.filter((reason) => reason.severity === "blocking").length,
      warning: reasons.filter((reason) => reason.severity === "warning").length,
      informational: reasons.filter((reason) => reason.severity === "informational").length,
    },
    payroll_posture: {
      is_payroll_ready: Boolean(profile.payroll_ready),
      open_period_entries: openEntriesCount ?? 0,
      blocking_exceptions: blocking,
      warning_exceptions: warning,
      in_current_period: (openEntriesCount ?? 0) > 0,
      missing_workforce_data: missingWorkforceData,
    },
    schedule_posture: {
      has_recurring_schedule: (scheduleTemplates ?? []).length > 0,
      recurring_rows: (scheduleTemplates ?? []).length,
      upcoming_override_count: (scheduleOverrides ?? []).length,
      upcoming_approved_away_count: (upcomingAwayBlocks ?? []).length,
      next_override: (scheduleOverrides ?? [])[0] ?? null,
      next_away_block: (upcomingAwayBlocks ?? [])[0] ?? null,
    },
    upcoming_time_off: upcomingAwayBlocks ?? [],
    recent_time_off_requests: timeOffRequests ?? [],
    audit_preview: prioritizedAudit,
  });
}

export async function PUT(req: NextRequest, context: unknown) {
  const { id: personId } = await (context as Ctx).params;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const check = await assertTarget(admin, access.profile.shop_id!, personId);
  if (!check.ok) {
    return NextResponse.json(
      { error: check.message },
      { status: check.status },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { full_name, phone, role, completed_onboarding, workforce_profile } = body as PersonUpdatePayload;
  if (
    workforce_profile !== undefined &&
    (!workforce_profile ||
      typeof workforce_profile !== "object" ||
      Array.isArray(workforce_profile))
  ) {
    return NextResponse.json(
      { error: "Workforce profile must be an object" },
      { status: 400 },
    );
  }
  if (
    completed_onboarding !== undefined &&
    typeof completed_onboarding !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Onboarding state must be true or false" },
      { status: 400 },
    );
  }

  const normalizedName = normalizeOptionalText(
    full_name,
    "Employee name",
    200,
    { requireValue: true },
  );
  const normalizedPhone = normalizeOptionalText(phone, "Phone number", 50);
  const normalizedWorkforceRole = normalizeOptionalText(
    workforce_profile?.workforce_role,
    "Workforce role",
    100,
  );
  const normalizedWorkforceCategory = normalizeOptionalText(
    workforce_profile?.workforce_category,
    "Workforce category",
    100,
  );
  const normalizedNotes = normalizeOptionalText(
    workforce_profile?.notes,
    "Workforce notes",
    2000,
  );
  if (!normalizedName.ok) {
    return NextResponse.json({ error: normalizedName.error }, { status: 400 });
  }
  if (!normalizedPhone.ok) {
    return NextResponse.json({ error: normalizedPhone.error }, { status: 400 });
  }
  if (!normalizedWorkforceRole.ok) {
    return NextResponse.json(
      { error: normalizedWorkforceRole.error },
      { status: 400 },
    );
  }
  if (!normalizedWorkforceCategory.ok) {
    return NextResponse.json(
      { error: normalizedWorkforceCategory.error },
      { status: 400 },
    );
  }
  if (!normalizedNotes.ok) {
    return NextResponse.json({ error: normalizedNotes.error }, { status: 400 });
  }

  const roleProvided = role !== undefined;
  const canonicalRole = roleProvided ? canonicalizeRole(role) : null;

  if (roleProvided && canonicalRole === "unknown") {
    return NextResponse.json({ error: "Invalid role value" }, { status: 400 });
  }
  if (
    workforce_profile?.employment_status != null &&
    !["active", "inactive", "on_leave"].includes(
      workforce_profile.employment_status,
    )
  ) {
    return NextResponse.json(
      { error: "Invalid employment status" },
      { status: 400 },
    );
  }
  if (
    workforce_profile?.payroll_ready != null &&
    typeof workforce_profile.payroll_ready !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Payroll readiness must be true or false" },
      { status: 400 },
    );
  }
  if (
    workforce_profile?.start_date !== undefined &&
    workforce_profile.start_date !== null &&
    !isValidScheduleDateKey(workforce_profile.start_date)
  ) {
    return NextResponse.json(
      { error: "Start date must be a valid calendar date" },
      { status: 400 },
    );
  }

  const [
    { data: currentProfile, error: currentProfileErr },
    { data: currentWorkforce, error: currentWorkforceErr },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("role")
      .eq("id", personId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle(),
    admin
      .from("people_workforce_profiles")
      .select(
        "workforce_role, workforce_category, employment_status, start_date, payroll_ready, notes",
      )
      .eq("shop_id", access.profile.shop_id)
      .eq("user_id", personId)
      .maybeSingle(),
  ]);

  if (currentProfileErr) return NextResponse.json({ error: currentProfileErr.message }, { status: 500 });
  if (currentWorkforceErr) {
    return NextResponse.json(
      { error: currentWorkforceErr.message },
      { status: 500 },
    );
  }

  const accessRoleChanged = roleProvided && canonicalRole !== null && canonicalRole !== (currentProfile?.role ?? null);

  if (accessRoleChanged && personId === access.profile.id) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 403 });
  }

  if (
    accessRoleChanged &&
    (canonicalRole === "owner" || canonicalRole === "admin") &&
    access.canonicalRole !== "owner"
  ) {
    return NextResponse.json({ error: "Only owners can assign owner/admin roles" }, { status: 403 });
  }
  const currentCanonicalRole = canonicalizeRole(currentProfile?.role);
  if (
    accessRoleChanged &&
    (currentCanonicalRole === "owner" ||
      currentCanonicalRole === "admin") &&
    access.canonicalRole !== "owner"
  ) {
    return NextResponse.json(
      { error: "Only owners can change owner/admin access" },
      { status: 403 },
    );
  }

  const profilePatch = {
    ...(normalizedName.value !== undefined
      ? { full_name: normalizedName.value }
      : {}),
    ...(normalizedPhone.value !== undefined
      ? { phone: normalizedPhone.value }
      : {}),
    ...(completed_onboarding !== undefined
      ? { completed_onboarding }
      : {}),
    ...(accessRoleChanged ? { role: canonicalRole } : {}),
  };

  if (Object.keys(profilePatch).length > 0) {
    const { error: pErr } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", personId)
      .eq("shop_id", access.profile.shop_id);

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
  }

  if (accessRoleChanged && canonicalRole !== null) {
    const authUserId = check.profile.user_id ?? check.profile.id;
    const { error: authErr } = await admin.auth.admin.updateUserById(authUserId, {
      user_metadata: { role: canonicalRole },
    });
    if (authErr) {
      const { error: rollbackError } = await admin
        .from("profiles")
        .update({ role: currentProfile?.role ?? null })
        .eq("id", personId)
        .eq("shop_id", access.profile.shop_id);
      return NextResponse.json(
        {
          error: rollbackError
            ? `${authErr.message}. Restoring the previous database role also failed: ${rollbackError.message}`
            : authErr.message,
        },
        { status: 500 },
      );
    }
  }

  if (workforce_profile) {
    const { error: wErr } = await admin.from("people_workforce_profiles").upsert(
      {
        shop_id: access.profile.shop_id,
        user_id: personId,
        workforce_role:
          normalizedWorkforceRole.value !== undefined
            ? normalizedWorkforceRole.value
            : currentWorkforce?.workforce_role ?? null,
        workforce_category:
          normalizedWorkforceCategory.value !== undefined
            ? normalizedWorkforceCategory.value
            : currentWorkforce?.workforce_category ?? null,
        employment_status:
          workforce_profile.employment_status !== undefined
            ? workforce_profile.employment_status ?? "active"
            : currentWorkforce?.employment_status ?? "active",
        start_date:
          workforce_profile.start_date !== undefined
            ? workforce_profile.start_date
            : currentWorkforce?.start_date ?? null,
        payroll_ready:
          workforce_profile.payroll_ready !== undefined
            ? workforce_profile.payroll_ready ?? false
            : currentWorkforce?.payroll_ready ?? false,
        notes:
          normalizedNotes.value !== undefined
            ? normalizedNotes.value
            : currentWorkforce?.notes ?? null,
      },
      { onConflict: "shop_id,user_id" },
    );
    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  }

  const auditRows = [];
  if (
    normalizedName.value !== undefined ||
    normalizedPhone.value !== undefined ||
    completed_onboarding !== undefined
  ) {
    auditRows.push({
      actor_id: access.profile.id,
      action: "people.profile.updated",
      target: personId,
      metadata: {
        shop_id: access.profile.shop_id,
        person_id: personId,
        name_updated: normalizedName.value !== undefined,
        phone_updated: normalizedPhone.value !== undefined,
        onboarding_updated: completed_onboarding !== undefined,
      },
    });
  }
  if (accessRoleChanged) {
    auditRows.push({
      actor_id: access.profile.id,
      action: "people.access_role.updated",
      target: personId,
      metadata: {
        shop_id: access.profile.shop_id,
        person_id: personId,
        updated_workforce: Boolean(workforce_profile),
        employment_status: workforce_profile?.employment_status ?? null,
        role_changed: accessRoleChanged,
        previous_role: currentProfile?.role ?? null,
        new_role: roleProvided ? canonicalRole : null,
      },
    });
  }
  if (workforce_profile) {
    auditRows.push({
      actor_id: access.profile.id,
      action: "people.workforce_profile.updated",
      target: personId,
      metadata: {
        shop_id: access.profile.shop_id,
        person_id: personId,
        employment_status: workforce_profile.employment_status ?? null,
        workforce_role:
          normalizedWorkforceRole.value !== undefined
            ? normalizedWorkforceRole.value
            : currentWorkforce?.workforce_role ?? null,
        payroll_ready:
          workforce_profile.payroll_ready !== undefined
            ? workforce_profile.payroll_ready ?? false
            : currentWorkforce?.payroll_ready ?? false,
      },
    });
  }
  if (auditRows.length > 0) {
    const { error: auditError } = await admin
      .from("audit_logs")
      .insert(auditRows);
    if (auditError) {
      return NextResponse.json(
        {
          ok: true,
          warning:
            "The employee record was updated, but its Activity entry could not be recorded.",
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
