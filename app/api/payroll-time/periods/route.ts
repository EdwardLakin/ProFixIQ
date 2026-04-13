import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getOrCreateCurrentPeriod } from "@/features/payroll-time/server/payrollTime";
import { requirePayrollReviewer } from "../_lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabase() as any;
  const { me } = auth;
  const url = new URL(req.url);
  const periodId = url.searchParams.get("period_id");

  await getOrCreateCurrentPeriod(me.shop_id!, me.id);

  const { data: periods, error: periodErr } = await admin
    .from("payroll_pay_periods")
    .select("*")
    .eq("shop_id", me.shop_id)
    .order("period_start", { ascending: false })
    .limit(12);

  if (periodErr) return NextResponse.json({ error: periodErr.message }, { status: 500 });

  const activePeriodId = periodId ?? periods?.[0]?.id ?? null;
  if (!activePeriodId) return NextResponse.json({ periods: [], entries: [], exceptions: [] });

  const [{ data: entries, error: entriesErr }, { data: exceptions, error: exErr }] = await Promise.all([
    admin
      .from("payroll_time_entries")
      .select("*, profiles:user_id(full_name, email)")
      .eq("shop_id", me.shop_id)
      .eq("period_id", activePeriodId)
      .order("work_date", { ascending: true }),
    admin
      .from("payroll_time_exceptions")
      .select("*")
      .eq("shop_id", me.shop_id)
      .eq("period_id", activePeriodId)
      .order("work_date", { ascending: true }),
  ]);

  if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 500 });
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  return NextResponse.json({ periods: periods ?? [], activePeriodId, entries: entries ?? [], exceptions: exceptions ?? [] });
}
