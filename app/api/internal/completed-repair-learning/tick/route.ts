import { NextResponse } from "next/server";

import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { processCompletedRepairLearningQueue } from "@/features/work-orders/server/processCompletedRepairLearningQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    req.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return { ok: true } as const;
  }
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_COMPLETED_REPAIR_LEARNING_SECRET",
    headerName: "x-internal-completed-repair-learning-secret",
    routeLabel: "internal/completed-repair-learning/tick",
  });
}

export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;

  try {
    const result = await processCompletedRepairLearningQueue(
      createAdminSupabase(),
      10,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Completed repair learning processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
