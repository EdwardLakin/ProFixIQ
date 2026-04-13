import { NextResponse } from "next/server";
import { rebuildPeriod } from "@/features/payroll-time/server/payrollTime";
import { requirePayrollReviewer } from "../_lib/auth";

export async function POST(req: Request) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { period_id?: string } | null;
  if (!body?.period_id) {
    return NextResponse.json({ error: "period_id is required" }, { status: 400 });
  }

  try {
    const result = await rebuildPeriod({
      shopId: auth.me.shop_id!,
      actorId: auth.me.id,
      periodId: body.period_id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rebuild period" },
      { status: 400 },
    );
  }
}
