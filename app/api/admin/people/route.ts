import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase() as any;
  const shopId = access.profile.shop_id;

  const [{ data: profiles, error: profilesErr }, { data: workforce }, { data: exceptions }, { data: certs }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, phone, role, completed_onboarding, last_active_at")
      .eq("shop_id", shopId)
      .order("full_name", { ascending: true }),
    admin.from("people_workforce_profiles").select("user_id, workforce_role, employment_status").eq("shop_id", shopId),
    admin.from("payroll_time_exceptions").select("user_id, severity, resolved").eq("shop_id", shopId).eq("resolved", false),
    admin.from("staff_certifications").select("user_id, expiry_date, status").eq("shop_id", shopId),
  ]);

  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 });

  const workforceByUser = new Map<string, { workforce_role: string | null; employment_status: "active" | "inactive" | "on_leave" | null }>();
  for (const row of workforce ?? []) workforceByUser.set(row.user_id, row);

  const exceptionByUser = new Map<string, { blocking: number; warning: number }>();
  for (const row of exceptions ?? []) {
    const current = exceptionByUser.get(row.user_id) ?? { blocking: 0, warning: 0 };
    if (row.severity === "blocking") current.blocking += 1;
    if (row.severity === "warning") current.warning += 1;
    exceptionByUser.set(row.user_id, current);
  }

  const certByUser = new Map<string, { open: number; expiring: number }>();
  const soon = Date.now() + 1000 * 60 * 60 * 24 * 30;
  for (const cert of certs ?? []) {
    const current = certByUser.get(cert.user_id) ?? { open: 0, expiring: 0 };
    if (cert.status === "active" || cert.status === "pending") current.open += 1;
    if (cert.expiry_date) {
      const ts = new Date(cert.expiry_date).getTime();
      if (ts <= soon && ts >= Date.now()) current.expiring += 1;
    }
    certByUser.set(cert.user_id, current);
  }

  const people = (profiles ?? []).map((profile: any) => {
    const workforce = workforceByUser.get(profile.id);
    const exceptions = exceptionByUser.get(profile.id) ?? { blocking: 0, warning: 0 };
    const cert = certByUser.get(profile.id) ?? { open: 0, expiring: 0 };

    return {
      ...profile,
      workforce_role: workforce?.workforce_role ?? null,
      employment_status: workforce?.employment_status ?? "active",
      payroll_blocking_exceptions: exceptions.blocking,
      payroll_warning_exceptions: exceptions.warning,
      open_certifications: cert.open,
      expiring_certifications: cert.expiring,
    };
  });

  return NextResponse.json({ people });
}
