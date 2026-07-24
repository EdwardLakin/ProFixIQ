import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { OWNER_PIN_PURPOSES, requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";
import { requirePayrollReviewer } from "../_lib/auth";

const CADENCES = new Set(["weekly", "biweekly", "semimonthly", "monthly"]);

function intIn(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Value must be an integer between ${min} and ${max}`);
  return n;
}

export async function GET() {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;
  const admin = createAdminSupabase() as any;
  const { data, error } = await admin.from("shop_payroll_settings").select("*").eq("shop_id", auth.me.shop_id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PUT(req: NextRequest) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;
  if (!['owner','admin'].includes(String(auth.me.role ?? ''))) return NextResponse.json({ error: "Owner/admin required" }, { status: 403 });

  const pin = await requireOwnerPinVerified(req, createServerSupabaseRoute() as never, {
    shopId: auth.me.shop_id!,
    userId: auth.me.id,
    allowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS, OWNER_PIN_PURPOSES.PRIVILEGED],
  });
  if (!pin.ok) return pin.response;

  const body = await req.json().catch(() => ({}));
  try {
    const cadence = String(body.cadence ?? "biweekly");
    if (!CADENCES.has(cadence)) throw new Error("Invalid pay cadence");
    const payload = {
      shop_id: auth.me.shop_id,
      cadence,
      week_starts_on: intIn(body.week_starts_on, 1, 0, 6),
      daily_overtime_after_minutes: intIn(body.daily_overtime_after_minutes, 480, 0, 1440),
      weekly_overtime_after_minutes: intIn(body.weekly_overtime_after_minutes, 2400, 0, 10080),
      period_anchor_date: typeof body.period_anchor_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.period_anchor_date)
        ? body.period_anchor_date
        : null,
      suspicious_shift_minutes: intIn(body.suspicious_shift_minutes, 960, 60, 2880),
      paid_breaks_per_day: intIn(body.paid_breaks_per_day, 2, 0, 2),
      paid_break_duration_minutes: intIn(body.paid_break_duration_minutes, 15, 0, 120),
      breaks_are_paid: body.breaks_are_paid !== false,
      lunch_is_paid: body.lunch_is_paid === true,
      default_lunch_duration_minutes: intIn(body.default_lunch_duration_minutes, 30, 0, 240),
      lunch_required_after_minutes: intIn(body.lunch_required_after_minutes, 300, 0, 1440),
      updated_at: new Date().toISOString(),
    };
    const admin = createAdminSupabase() as any;
    const { data, error } = await admin.from("shop_payroll_settings").upsert(payload, { onConflict: "shop_id" }).select("*").single();
    if (error) throw new Error(error.message);
    void admin.from("audit_logs").insert({
      actor_id: auth.me.id,
      action: "payroll.settings.updated",
      target: data.id,
      metadata: { ...payload, shop_id: auth.me.shop_id },
    });
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payroll settings" }, { status: 400 });
  }
}
