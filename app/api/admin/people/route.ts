import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const DAY = 1000 * 60 * 60 * 24;

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

    return {
      ...profile,
      workforce_role: workforceRow?.workforce_role ?? null,
      employment_status: workforceRow?.employment_status ?? "active",
      payroll_ready: Boolean(workforceRow?.payroll_ready),
      payroll_blocking_exceptions: payrollExceptions.blocking,
      payroll_warning_exceptions: payrollExceptions.warning,
      payroll_open_period_entries: openPeriodEntries,
      open_certifications: cert.open,
      expiring_certifications: cert.expiring30,
      cert_expiring_60: cert.expiring60,
      expired_certifications: cert.expired,
      revoked_certifications: cert.revoked,
    };
  });

  return NextResponse.json({ people });
}
