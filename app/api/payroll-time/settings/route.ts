import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { OWNER_PIN_PURPOSES, requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";
import { requirePayrollReviewer } from "../_lib/auth";
import { getOrCreateCurrentPeriod } from "@/features/payroll-time/server/payrollTime";
import {
  isValidPayrollDateKey,
  type PayrollCadence,
} from "@/features/payroll-time/lib/payPeriodBounds";

const CADENCES = new Set(["weekly", "biweekly", "semimonthly", "monthly"]);

type SettingsBody = Partial<{
  cadence: PayrollCadence;
  week_starts_on: number;
  daily_overtime_after_minutes: number;
  weekly_overtime_after_minutes: number;
  period_anchor_date: string | null;
  suspicious_shift_minutes: number;
  paid_breaks_per_day: number;
  paid_break_duration_minutes: number;
  breaks_are_paid: boolean;
  lunch_is_paid: boolean;
  default_lunch_duration_minutes: number;
  lunch_required_after_minutes: number;
}>;

function intIn(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Value must be an integer between ${min} and ${max}`);
  return n;
}

export async function GET() {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("shop_payroll_settings").select("*").eq("shop_id", auth.me.shop_id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PUT(req: NextRequest) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;
  if (!['owner','admin'].includes(String(auth.me.role ?? ''))) return NextResponse.json({ error: "Owner/admin required" }, { status: 403 });

  const pin = await requireOwnerPinVerified(req, auth.supabase as never, {
    shopId: auth.me.shop_id!,
    userId: auth.authUserId,
    allowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS, OWNER_PIN_PURPOSES.PRIVILEGED],
  });
  if (!pin.ok) return pin.response;

  const body = (await req.json().catch(() => null)) as SettingsBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "Payroll settings payload is required." },
      { status: 400 },
    );
  }
  try {
    const admin = createAdminSupabase();
    const { data: existing, error: existingError } = await admin
      .from("shop_payroll_settings")
      .select("*")
      .eq("shop_id", auth.me.shop_id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const cadence = String(body.cadence ?? existing?.cadence ?? "biweekly");
    if (!CADENCES.has(cadence)) throw new Error("Invalid pay cadence");
    const rawAnchorDate =
      body.period_anchor_date !== undefined
        ? body.period_anchor_date
        : existing?.period_anchor_date ?? null;
    const periodAnchorDate = rawAnchorDate?.trim() || null;
    if (periodAnchorDate && !isValidPayrollDateKey(periodAnchorDate)) {
      throw new Error("Anchor date must be a valid calendar date");
    }
    if (cadence === "biweekly" && !periodAnchorDate) {
      throw new Error("Bi-weekly payroll requires an anchor period start date");
    }

    const payload = {
      shop_id: auth.me.shop_id,
      cadence,
      week_starts_on: intIn(body.week_starts_on, existing?.week_starts_on ?? 1, 0, 6),
      daily_overtime_after_minutes: intIn(
        body.daily_overtime_after_minutes,
        existing?.daily_overtime_after_minutes ?? 480,
        0,
        1440,
      ),
      weekly_overtime_after_minutes: intIn(
        body.weekly_overtime_after_minutes,
        existing?.weekly_overtime_after_minutes ?? 2400,
        0,
        10080,
      ),
      period_anchor_date: periodAnchorDate,
      suspicious_shift_minutes: intIn(
        body.suspicious_shift_minutes,
        existing?.suspicious_shift_minutes ?? 960,
        60,
        2880,
      ),
      paid_breaks_per_day: intIn(
        body.paid_breaks_per_day,
        existing?.paid_breaks_per_day ?? 2,
        0,
        2,
      ),
      paid_break_duration_minutes: intIn(
        body.paid_break_duration_minutes,
        existing?.paid_break_duration_minutes ?? 15,
        0,
        120,
      ),
      breaks_are_paid: body.breaks_are_paid ?? existing?.breaks_are_paid ?? true,
      lunch_is_paid: body.lunch_is_paid ?? existing?.lunch_is_paid ?? false,
      default_lunch_duration_minutes: intIn(
        body.default_lunch_duration_minutes,
        existing?.default_lunch_duration_minutes ?? 30,
        0,
        240,
      ),
      lunch_required_after_minutes: intIn(
        body.lunch_required_after_minutes,
        existing?.lunch_required_after_minutes ?? 300,
        0,
        1440,
      ),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("shop_payroll_settings").upsert(payload, { onConflict: "shop_id" }).select("*").single();
    if (error) throw new Error(error.message);
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: auth.me.id,
      action: "payroll.settings.updated",
      target: data.id,
      metadata: { ...payload, shop_id: auth.me.shop_id },
    });
    const current = await getOrCreateCurrentPeriod(auth.me.shop_id!);
    return NextResponse.json({
      ok: true,
      settings: data,
      currentPeriod: current.period,
      warning: auditError
        ? "Payroll settings were saved, but the Activity entry could not be recorded. No retry is needed."
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payroll settings" }, { status: 400 });
  }
}
