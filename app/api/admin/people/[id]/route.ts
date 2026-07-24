import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

type Ctx = { params: { id: string } };
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

async function assertTarget(admin: AdminClient, shopId: string, userId: string) {
  const { data, error } = await admin.from("profiles").select("id, shop_id").eq("id", userId).maybeSingle();
  if (error) return { ok: false, message: error.message } as const;
  if (!data || data.shop_id !== shopId) return { ok: false, message: "Person not found in this shop" } as const;
  return { ok: true } as const;
}

export async function GET(_req: NextRequest, context: unknown) {
  const { params } = context as Ctx;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const check = await assertTarget(admin, access.profile.shop_id!, params.id);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 403 });

  const [{ data: person, error: pErr }, { data: workforce }, { data: certs }, { count: openEntriesCount }, { data: openExceptions }, { data: scheduleTemplates }, { data: scheduleOverrides }, { data: upcomingAwayBlocks }, { data: timeOffRequests }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, phone, role, completed_onboarding, created_at, last_active_at").eq("id", params.id).maybeSingle(),
    admin
      .from("people_workforce_profiles")
      .select("workforce_role, workforce_category, employment_status, start_date, payroll_ready, notes")
      .eq("shop_id", access.profile.shop_id)
      .eq("user_id", params.id)
      .maybeSingle(),
    admin
      .from("staff_certifications")
      .select("id, cert_type, cert_name, cert_number, issuing_body, issue_date, expiry_date, status, notes")
      .eq("shop_id", access.profile.shop_id)
      .eq("user_id", params.id)
      .order("created_at", { ascending: false }),
    admin
      .from("payroll_time_entries")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", access.profile.shop_id)
      .eq("user_id", params.id)
      .in("approval_state", ["draft", "reviewed"]),
    admin.from("payroll_time_exceptions").select("severity, resolved").eq("shop_id", access.profile.shop_id).eq("user_id", params.id).eq("resolved", false),
    admin.from("staff_schedule_templates").select("id, day_of_week, start_time, end_time, is_working_day").eq("shop_id", access.profile.shop_id).eq("user_id", params.id),
    admin.from("staff_schedule_overrides").select("id, schedule_date, start_time, end_time, status").eq("shop_id", access.profile.shop_id).eq("user_id", params.id).gte("schedule_date", new Date().toISOString().slice(0, 10)).order("schedule_date", { ascending: true }).limit(14),
    admin.from("staff_availability_blocks").select("id, starts_at, ends_at, block_type, label").eq("shop_id", access.profile.shop_id).eq("user_id", params.id).gte("ends_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(14),
    admin.from("staff_time_off_requests").select("id, status, starts_at, ends_at, request_type, reason").eq("shop_id", access.profile.shop_id).eq("user_id", params.id).order("created_at", { ascending: false }).limit(14),
  ]);

  const { data: audit } = await admin
    .from("audit_logs")
    .select("id, action, created_at, target, metadata, actor_id")
    .or(`actor_id.eq.${params.id},target.ilike.%${params.id}%`)
    .order("created_at", { ascending: false })
    .limit(12);

  if (pErr || !person) return NextResponse.json({ error: pErr?.message ?? "Person not found" }, { status: 404 });

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

  const now = Date.now();
  const in30 = now + 1000 * 60 * 60 * 24 * 30;
  const certifications = (certs ?? []).map((cert) => {
    const expiryTs = cert.expiry_date ? new Date(cert.expiry_date).getTime() : null;
    const isExpired = cert.status === "expired" || (expiryTs ? expiryTs < now : false);
    const daysRemaining = expiryTs ? Math.ceil((expiryTs - now) / (1000 * 60 * 60 * 24)) : null;
    let lifecycle_group: "expired" | "expiring_soon" | "active";
    if (isExpired) lifecycle_group = "expired";
    else if (expiryTs && expiryTs <= in30) lifecycle_group = "expiring_soon";
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
      action_href: `/dashboard/workforce/payroll-review?person_id=${params.id}`,
    });
  }
  if (!profile.payroll_ready) {
    reasons.push({
      code: "payroll_not_ready",
      severity: "blocking",
      label: "Payroll profile is not ready",
      action_label: "Fix payroll data",
      action_href: `/dashboard/workforce/people/${params.id}#workforce`,
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
      severity: "blocking",
      label: `Missing required profile fields: ${missingWorkforceData.join(", ")}`,
      action_label: "Complete workforce profile",
      action_href: `/dashboard/workforce/people/${params.id}#workforce`,
    });
  }
  const expiredCount = certifications.filter((cert) => cert.lifecycle_group === "expired").length;
  if (expiredCount > 0) {
    reasons.push({
      code: "cert_expired",
      severity: "blocking",
      label: `${expiredCount} certification${expiredCount > 1 ? "s are" : " is"} expired`,
      action_label: "Update certification",
      action_href: `/dashboard/workforce/people/${params.id}#certifications`,
    });
  }
  const expiringSoonCount = certifications.filter((cert) => cert.lifecycle_group === "expiring_soon").length;
  if (expiringSoonCount > 0) {
    reasons.push({
      code: "cert_expiring_soon",
      severity: "warning",
      label: `${expiringSoonCount} certification${expiringSoonCount > 1 ? "s" : ""} expiring soon`,
      action_label: "Renew certification",
      action_href: `/dashboard/workforce/people/${params.id}#certifications`,
    });
  }
  if (warning > 0) {
    reasons.push({
      code: "payroll_warning_exceptions",
      severity: "warning",
      label: `${warning} payroll warning${warning > 1 ? "s" : ""}`,
      action_label: "Review payroll entries",
      action_href: `/dashboard/workforce/payroll-review?person_id=${params.id}`,
    });
  }
  if (profile.employment_status === "inactive" && (openEntriesCount ?? 0) > 0) {
    reasons.push({
      code: "inactive_in_payroll_scope",
      severity: "informational",
      label: "Inactive employee still has open payroll entries",
      action_label: "Review payroll entries",
      action_href: `/dashboard/workforce/payroll-review?person_id=${params.id}`,
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
      return { ...row, priority };
    })
    .sort((a, b) => (b.priority - a.priority) || ((new Date(b.created_at ?? 0).getTime()) - (new Date(a.created_at ?? 0).getTime())));

  return NextResponse.json({
    ...person,
    workforce_profile: profile,
    certifications,
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
  const { params } = context as Ctx;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const check = await assertTarget(admin, access.profile.shop_id!, params.id);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { full_name, phone, role, completed_onboarding, workforce_profile } = body as PersonUpdatePayload;
  const roleProvided = role !== undefined;
  const canonicalRole = roleProvided ? canonicalizeRole(role) : null;

  if (roleProvided && canonicalRole === "unknown") {
    return NextResponse.json({ error: "Invalid role value" }, { status: 400 });
  }

  const { data: currentProfile, error: currentProfileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", params.id)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (currentProfileErr) return NextResponse.json({ error: currentProfileErr.message }, { status: 500 });

  const accessRoleChanged = roleProvided && canonicalRole !== null && canonicalRole !== (currentProfile?.role ?? null);

  if (accessRoleChanged && params.id === access.profile.id) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 403 });
  }

  if (
    accessRoleChanged &&
    (canonicalRole === "owner" || canonicalRole === "admin") &&
    access.canonicalRole !== "owner"
  ) {
    return NextResponse.json({ error: "Only owners can assign owner/admin roles" }, { status: 403 });
  }

  const profilePatch = { full_name, phone, completed_onboarding, ...(accessRoleChanged ? { role: canonicalRole } : {}) };

  const { error: pErr } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", params.id)
    .eq("shop_id", access.profile.shop_id);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  if (accessRoleChanged && canonicalRole !== null) {
    const { error: authErr } = await admin.auth.admin.updateUserById(params.id, {
      user_metadata: { role: canonicalRole },
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  if (workforce_profile) {
    const { error: wErr } = await admin.from("people_workforce_profiles").upsert(
      {
        shop_id: access.profile.shop_id,
        user_id: params.id,
        workforce_role: workforce_profile.workforce_role ?? null,
        workforce_category: workforce_profile.workforce_category ?? null,
        employment_status: workforce_profile.employment_status ?? "active",
        start_date: workforce_profile.start_date ?? null,
        payroll_ready: Boolean(workforce_profile.payroll_ready),
        notes: workforce_profile.notes ?? null,
      },
      { onConflict: "shop_id,user_id" },
    );
    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  }

  if (accessRoleChanged) await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "people.access_role.updated",
    target: params.id,
    metadata: {
      shop_id: access.profile.shop_id,
      person_id: params.id,
      updated_workforce: Boolean(workforce_profile),
      employment_status: workforce_profile?.employment_status ?? null,
      role_changed: accessRoleChanged,
      previous_role: currentProfile?.role ?? null,
      new_role: roleProvided ? canonicalRole : null,
    },
  });

  if (workforce_profile) await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "people.workforce_profile.updated",
    target: params.id,
    metadata: {
      shop_id: access.profile.shop_id,
      person_id: params.id,
      employment_status: workforce_profile.employment_status ?? null,
      workforce_role: workforce_profile.workforce_role ?? null,
      payroll_ready: Boolean(workforce_profile.payroll_ready),
    },
  });

  return NextResponse.json({ ok: true });
}
