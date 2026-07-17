import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";

type CorrectionType =
  | "create_missing_shift"
  | "adjust_start"
  | "adjust_end"
  | "adjust_start_and_end"
  | "void_shift"
  | "adjust_punch";

type Body = {
  correction_type?: CorrectionType;
  target_user_id?: string;
  shift_id?: string;
  punch_id?: string;
  corrected_start_time?: string;
  corrected_end_time?: string;
  corrected_punch_local?: string;
  reason?: string;
};

type Caller = { id: string; role: string | null; shop_id: string | null };

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

async function authz() {
  const supabase = createServerSupabaseRoute();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false as const, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<Caller>();

  if (meErr || !me?.shop_id) return { ok: false as const, response: NextResponse.json({ error: "Missing shop context" }, { status: 403 }) };
  const caps = getActorCapabilities({ role: me.role });
  if (!caps.isKnownRole || !caps.canManageScheduling) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true as const, me };
}

export async function POST(req: Request) {
  const auth = await authz();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const reason = body?.reason?.trim();
  if (!body?.correction_type) return NextResponse.json({ error: "correction_type is required" }, { status: 400 });
  if (!body.target_user_id) return NextResponse.json({ error: "target_user_id is required" }, { status: 400 });
  if (!reason || reason.length < 3) return NextResponse.json({ error: "A correction reason of at least 3 characters is required" }, { status: 400 });
  if (body.target_user_id === auth.me.id && auth.me.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can apply an audited correction to their own time." }, { status: 403 });
  }

  const admin = createAdminSupabase() as any;

  if (body.correction_type === "adjust_punch") {
    if (!body.punch_id) return NextResponse.json({ error: "punch_id is required" }, { status: 400 });
    const local = body.corrected_punch_local?.trim();
    const match = local ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec(local) : null;
    if (!match) return NextResponse.json({ error: "A valid shop-local punch date and time is required" }, { status: 400 });

    const { data: shop, error: shopError } = await admin
      .from("shops")
      .select("timezone")
      .eq("id", auth.me.shop_id)
      .maybeSingle();
    if (shopError) return NextResponse.json({ error: shopError.message }, { status: 400 });

    let correctedTimestamp: string;
    try {
      correctedTimestamp = shopLocalDateTimeToUtc(match[1], match[2], shop?.timezone ?? "UTC");
    } catch {
      return NextResponse.json({ error: "Invalid punch date or time for the shop timezone" }, { status: 400 });
    }

    const { data, error } = await admin.rpc("apply_punch_correction", {
      p_shop_id: auth.me.shop_id,
      p_actor_profile_id: auth.me.id,
      p_punch_id: body.punch_id,
      p_corrected_timestamp: correctedTimestamp,
      p_reason: reason,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, correction: data });
  }

  const needsShift = body.correction_type !== "create_missing_shift";
  if (needsShift && !body.shift_id) return NextResponse.json({ error: "shift_id is required" }, { status: 400 });
  if (body.correction_type === "create_missing_shift" && (!isIso(body.corrected_start_time) || !isIso(body.corrected_end_time))) {
    return NextResponse.json({ error: "corrected_start_time and corrected_end_time are required" }, { status: 400 });
  }
  if ((body.correction_type === "adjust_start" || body.correction_type === "adjust_start_and_end") && !isIso(body.corrected_start_time)) {
    return NextResponse.json({ error: "corrected_start_time is required" }, { status: 400 });
  }
  if ((body.correction_type === "adjust_end" || body.correction_type === "adjust_start_and_end") && !isIso(body.corrected_end_time)) {
    return NextResponse.json({ error: "corrected_end_time is required" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("apply_shift_correction", {
    p_shop_id: auth.me.shop_id,
    p_actor_profile_id: auth.me.id,
    p_target_user_id: body.target_user_id,
    p_shift_id: body.shift_id ?? null,
    p_correction_type: body.correction_type,
    p_corrected_start_time: body.corrected_start_time ?? null,
    p_corrected_end_time: body.corrected_end_time ?? null,
    p_reason: reason,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, correction: data });
}
