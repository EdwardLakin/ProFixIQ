import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const DAY = 1000 * 60 * 60 * 24;
type ActionSeverity = "blocking" | "warning" | "informational";

type ActionReason = {
  code:
    | "cert_expired"
    | "cert_expiring_soon"
    | "workforce_profile_missing"
    | "payroll_not_ready"
    | "payroll_blocking_exceptions"
    | "payroll_warning_exceptions"
    | "inactive_in_payroll_scope";
  severity: ActionSeverity;
  label: string;
  action_label: string;
  action_href: string;
};

export async function GET() {
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase() as any;
  const shopId = access.profile.shop_id;

  const [
    { data: profiles, error: profilesErr },
    { data: workforce },
    { data: exceptions },
    { data: certs },
    { data: periodEntries },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, phone, role, completed_onboarding, last_active_at")
      .eq("shop_id", shopId)
      .order("full_name", { ascending: true }),
    admin.from("people_workforce_profiles").select("user_id, workforce_role, employment_status, payroll_ready").eq("shop_id", shopId),
    admin.from("payroll_time_exceptions").select("user_id, severity, resolved").eq("shop_id", shopId).eq("resolved", false),
    admin.from("staff_certifications").select("user_id, expiry_date, status").eq("shop_id", shopId),
    admin
      .from("payroll_time_entries")
      .select("user_id")
      .eq("shop_id", shopId)
      .in("approval_state", ["draft", "reviewed"]),
  ]);

  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 });

  const now = Date.now();
  const in30Days = now + DAY * 30;
  const in60Days = now + DAY * 60;

  const workforceByUser = new Map<
    string,
    { workforce_role: string | null; employment_status: "active" | "inactive" | "on_leave" | null; payroll_ready: boolean | null }
  >();
  for (const row of workforce ?? []) workforceByUser.set(row.user_id, row);

  const exceptionByUser = new Map<string, { blocking: number; warning: number }>();
  for (const row of exceptions ?? []) {
    const current = exceptionByUser.get(row.user_id) ?? { blocking: 0, warning: 0 };
    if (row.severity === "blocking") current.blocking += 1;
    if (row.severity === "warning") current.warning += 1;
    exceptionByUser.set(row.user_id, current);
  }

  const openEntriesByUser = new Map<string, number>();
  for (const row of periodEntries ?? []) {
    openEntriesByUser.set(row.user_id, (openEntriesByUser.get(row.user_id) ?? 0) + 1);
  }

  const certByUser = new Map<string, { open: number; expiring30: number; expiring60: number; expired: number; revoked: number }>();
  for (const cert of certs ?? []) {
    const current = certByUser.get(cert.user_id) ?? { open: 0, expiring30: 0, expiring60: 0, expired: 0, revoked: 0 };
    if (cert.status === "active" || cert.status === "pending") current.open += 1;
    if (cert.status === "revoked") current.revoked += 1;

    if (cert.expiry_date) {
      const ts = new Date(cert.expiry_date).getTime();
      if (ts < now || cert.status === "expired") {
        current.expired += 1;
      } else if (ts <= in30Days) {
        current.expiring30 += 1;
      } else if (ts <= in60Days) {
        current.expiring60 += 1;
      }
    }

    certByUser.set(cert.user_id, current);
  }

  const people = (profiles ?? []).map((profile: any) => {
    const workforceRow = workforceByUser.get(profile.id);
    const payrollExceptions = exceptionByUser.get(profile.id) ?? { blocking: 0, warning: 0 };
    const cert = certByUser.get(profile.id) ?? { open: 0, expiring30: 0, expiring60: 0, expired: 0, revoked: 0 };
    const openPeriodEntries = openEntriesByUser.get(profile.id) ?? 0;
    const employmentStatus = workforceRow?.employment_status ?? "active";
    const missingWorkforceData = !workforceRow?.workforce_role;
    const reasons: ActionReason[] = [];

    if (payrollExceptions.blocking > 0) {
      reasons.push({
        code: "payroll_blocking_exceptions",
        severity: "blocking",
        label: `${payrollExceptions.blocking} payroll blocking issue${payrollExceptions.blocking > 1 ? "s" : ""}`,
        action_label: "Review payroll entries",
        action_href: `/dashboard/admin/payroll-time?person_id=${profile.id}`,
      });
    }
    if (!workforceRow?.payroll_ready) {
      reasons.push({
        code: "payroll_not_ready",
        severity: "blocking",
        label: "Payroll profile is not ready",
        action_label: "Fix payroll data",
        action_href: `/dashboard/admin/people/${profile.id}`,
      });
    }
    if (missingWorkforceData) {
      reasons.push({
        code: "workforce_profile_missing",
        severity: "blocking",
        label: "Workforce role is missing",
        action_label: "Complete workforce profile",
        action_href: `/dashboard/admin/people/${profile.id}`,
      });
    }
    if (cert.expired > 0) {
      reasons.push({
        code: "cert_expired",
        severity: "blocking",
        label: `${cert.expired} certification${cert.expired > 1 ? "s are" : " is"} expired`,
        action_label: "Update certification",
        action_href: `/dashboard/admin/people/${profile.id}#certifications`,
      });
    }
    if (payrollExceptions.warning > 0) {
      reasons.push({
        code: "payroll_warning_exceptions",
        severity: "warning",
        label: `${payrollExceptions.warning} payroll warning${payrollExceptions.warning > 1 ? "s" : ""}`,
        action_label: "Review payroll entries",
        action_href: `/dashboard/admin/payroll-time?person_id=${profile.id}`,
      });
    }
    if (cert.expiring30 > 0) {
      reasons.push({
        code: "cert_expiring_soon",
        severity: "warning",
        label: `${cert.expiring30} certification${cert.expiring30 > 1 ? "s" : ""} expiring in 30 days`,
        action_label: "Renew certification",
        action_href: `/dashboard/admin/people/${profile.id}#certifications`,
      });
    }
    if (employmentStatus === "inactive" && openPeriodEntries > 0) {
      reasons.push({
        code: "inactive_in_payroll_scope",
        severity: "informational",
        label: "Inactive employee still has open payroll entries",
        action_label: "Review payroll entries",
        action_href: `/dashboard/admin/payroll-time?person_id=${profile.id}`,
      });
    }

    const highestSeverity: ActionSeverity | null = reasons.length === 0
      ? null
      : reasons.some((reason) => reason.severity === "blocking")
        ? "blocking"
        : reasons.some((reason) => reason.severity === "warning")
          ? "warning"
          : "informational";

    return {
      ...profile,
      workforce_role: workforceRow?.workforce_role ?? null,
      employment_status: employmentStatus,
      payroll_ready: Boolean(workforceRow?.payroll_ready),
      payroll_blocking_exceptions: payrollExceptions.blocking,
      payroll_warning_exceptions: payrollExceptions.warning,
      payroll_open_period_entries: openPeriodEntries,
      open_certifications: cert.open,
      expiring_certifications: cert.expiring30,
      cert_expiring_60: cert.expiring60,
      expired_certifications: cert.expired,
      revoked_certifications: cert.revoked,
      needs_action: reasons.length > 0,
      highest_action_severity: highestSeverity,
      action_reasons: reasons,
      action_counts: {
        blocking: reasons.filter((reason) => reason.severity === "blocking").length,
        warning: reasons.filter((reason) => reason.severity === "warning").length,
        informational: reasons.filter((reason) => reason.severity === "informational").length,
      },
    };
  });

  return NextResponse.json({ people });
}
