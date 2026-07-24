import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type CreditInput = {
  technician_id?: string;
  credit_hours?: number;
};

export async function GET(req: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canReviewWorkforceTime",
  });
  if (!access.ok) return access.response;

  const lineId = req.nextUrl.searchParams.get("line_id");
  const admin = createAdminSupabase() as any;
  if (!lineId) {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json(
        { error: "line_id or a from/to range is required" },
        { status: 400 },
      );
    }

    const { data: credits, error } = await admin
      .from("work_order_line_flat_rate_credits")
      .select(
        "id, work_order_line_id, technician_id, credit_hours, credit_source, actual_job_seconds, credited_at, adjustment_reason, technician:technician_id(full_name), line:work_order_line_id(description, labor_time, status, work_order_id)",
      )
      .eq("shop_id", access.profile.shop_id)
      .gte("credited_at", `${from}T00:00:00.000Z`)
      .lt("credited_at", `${to}T23:59:59.999Z`)
      .order("credited_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ credits: credits ?? [] });
  }

  const { data: line, error: lineError } = await admin
    .from("work_order_lines")
    .select("id, work_order_id, description, labor_time, status")
    .eq("id", lineId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (lineError) {
    return NextResponse.json({ error: lineError.message }, { status: 500 });
  }
  if (!line) {
    return NextResponse.json({ error: "Work-order line not found" }, { status: 404 });
  }

  const { data: credits, error: creditsError } = await admin
    .from("work_order_line_flat_rate_credits")
    .select(
      "id, technician_id, credit_hours, credit_source, actual_job_seconds, credited_at, adjustment_reason, technician:technician_id(full_name)",
    )
    .eq("shop_id", access.profile.shop_id)
    .eq("work_order_line_id", lineId)
    .order("credit_hours", { ascending: false });

  if (creditsError) {
    return NextResponse.json({ error: creditsError.message }, { status: 500 });
  }

  return NextResponse.json({ line, credits: credits ?? [] });
}

export async function PUT(req: NextRequest) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager"],
    requiredCapability: "canReviewWorkforceTime",
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as
    | { line_id?: string; credits?: CreditInput[]; reason?: string }
    | null;

  const lineId = body?.line_id?.trim();
  const reason = body?.reason?.trim();
  const credits = body?.credits;
  if (!lineId || !reason || !Array.isArray(credits) || credits.length === 0) {
    return NextResponse.json(
      { error: "line_id, reason, and at least one credit are required" },
      { status: 400 },
    );
  }

  const normalized = credits.map((credit) => ({
    technician_id: String(credit.technician_id ?? "").trim(),
    credit_hours: Number(credit.credit_hours),
  }));
  if (
    normalized.some(
      (credit) =>
        !credit.technician_id ||
        !Number.isFinite(credit.credit_hours) ||
        credit.credit_hours < 0,
    )
  ) {
    return NextResponse.json(
      { error: "Each credit needs a technician and non-negative hours" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase() as any;
  const { data, error } = await admin.rpc(
    "replace_work_order_line_flat_rate_credits",
    {
      p_shop_id: access.profile.shop_id,
      p_actor_profile_id: access.profile.id,
      p_line_id: lineId,
      p_credits: normalized,
      p_reason: reason,
    },
  );

  if (error) {
    const conflict =
      /locked|total|completed|technician|not found/i.test(error.message);
    return NextResponse.json(
      { error: error.message },
      { status: conflict ? 409 : 500 },
    );
  }

  return NextResponse.json(data ?? { ok: true });
}
