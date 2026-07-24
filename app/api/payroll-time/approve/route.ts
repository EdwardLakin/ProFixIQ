import { NextResponse } from "next/server";
import { approvePeriod } from "@/features/payroll-time/server/payrollTime";
import { requirePayrollReviewer } from "../_lib/auth";

export async function POST(req: Request) {
  const auth = await requirePayrollReviewer({ finalize: true });
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { period_id?: string } | null;
  if (!body?.period_id) return NextResponse.json({ error: "period_id is required" }, { status: 400 });

  try {
    await approvePeriod({ shopId: auth.me.shop_id!, periodId: body.period_id, actorId: auth.me.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed" },
      { status: 400 },
    );
  }
}
