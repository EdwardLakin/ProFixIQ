import { NextResponse } from "next/server";
import { exportPeriod, PayrollExportError } from "@/features/payroll-time/server/payrollTime";
import { requirePayrollReviewer } from "../_lib/auth";

export async function POST(req: Request) {
  const auth = await requirePayrollReviewer({ finalize: true });
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { period_id?: string; provider_type?: string } | null;
  if (!body?.period_id) return NextResponse.json({ error: "period_id is required" }, { status: 400 });

  try {
    const result = await exportPeriod({
      shopId: auth.me.shop_id!,
      periodId: body.period_id,
      actorId: auth.me.id,
      providerType: body.provider_type,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PayrollExportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 },
    );
  }
}
