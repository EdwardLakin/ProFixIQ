import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type Ctx = { params: { id: string } };

async function assertTarget(admin: any, shopId: string, userId: string) {
  const { data, error } = await admin.from("profiles").select("id, shop_id").eq("id", userId).maybeSingle();
  if (error) return { ok: false, message: error.message } as const;
  if (!data || data.shop_id !== shopId) return { ok: false, message: "Person not found in this shop" } as const;
  return { ok: true } as const;
}

export async function GET(_req: NextRequest, context: unknown) {
  const { params } = context as Ctx;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase() as any;
  const check = await assertTarget(admin, access.profile.shop_id!, params.id);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 403 });

  const [{ data: person, error: pErr }, { data: workforce }, { data: certs }, { data: openEntries }, { data: openExceptions }, { data: audit }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, phone, role, completed_onboarding, created_at, last_active_at").eq("id", params.id).maybeSingle(),
    admin.from("people_workforce_profiles").select("workforce_role, workforce_category, employment_status, start_date, payroll_ready, notes").eq("shop_id", access.profile.shop_id).eq("user_id", params.id).maybeSingle(),
    admin.from("staff_certifications").select("id, cert_type, cert_name, cert_number, issuing_body, issue_date, expiry_date, status, notes").eq("shop_id", access.profile.shop_id).eq("user_id", params.id).order("created_at", { ascending: false }),
    admin.from("payroll_time_entries").select("id", { count: "exact", head: true }).eq("shop_id", access.profile.shop_id).eq("user_id", params.id).in("approval_state", ["draft", "reviewed"]),
    admin.from("payroll_time_exceptions").select("severity, resolved").eq("shop_id", access.profile.shop_id).eq("user_id", params.id).eq("resolved", false),
    admin.from("audit_logs").select("id, action, created_at, target").eq("actor_id", params.id).order("created_at", { ascending: false }).limit(8),
  ]);

  if (pErr || !person) return NextResponse.json({ error: pErr?.message ?? "Person not found" }, { status: 404 });

  const blocking = (openExceptions ?? []).filter((row: any) => row.severity === "blocking").length;
  const warning = (openExceptions ?? []).filter((row: any) => row.severity === "warning").length;

  return NextResponse.json({
    ...person,
    workforce_profile: workforce ?? {
      workforce_role: null,
      workforce_category: null,
      employment_status: "active",
      start_date: null,
      payroll_ready: false,
      notes: null,
    },
    certifications: certs ?? [],
    payroll_posture: {
      open_period_entries: openEntries?.count ?? 0,
      blocking_exceptions: blocking,
      warning_exceptions: warning,
    },
    audit_preview: audit ?? [],
  });
}

export async function PUT(req: NextRequest, context: unknown) {
  const { params } = context as Ctx;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase() as any;
  const check = await assertTarget(admin, access.profile.shop_id!, params.id);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { full_name, phone, role, completed_onboarding, workforce_profile } = body as any;

  const { error: pErr } = await admin
    .from("profiles")
    .update({ full_name, phone, role, completed_onboarding })
    .eq("id", params.id)
    .eq("shop_id", access.profile.shop_id);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

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

  return NextResponse.json({ ok: true });
}
