import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
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
  corrected_start_local?: string;
  corrected_end_local?: string;
  corrected_punch_local?: string;
  reason?: string;
};

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

export async function POST(req: Request) {
  const auth = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!auth.ok) return auth.response;
  const me = auth.profile;

  const body = (await req.json().catch(() => null)) as Body | null;
  const reason = body?.reason?.trim();
  if (!body?.correction_type) return NextResponse.json({ error: "correction_type is required" }, { status: 400 });
  if (!body.target_user_id) return NextResponse.json({ error: "target_user_id is required" }, { status: 400 });
  if (!reason || reason.length < 3) return NextResponse.json({ error: "A correction reason of at least 3 characters is required" }, { status: 400 });
  if (reason.length > 1000) {
    return NextResponse.json(
      { error: "Correction reason must be 1000 characters or fewer" },
      { status: 400 },
    );
  }
  if (
    body.target_user_id === me.id &&
    auth.canonicalRole !== "owner"
  ) {
    return NextResponse.json({ error: "Only an owner can apply an audited correction to their own time." }, { status: 403 });
  }

  const admin = createAdminSupabase() as any;
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", me.shop_id)
    .maybeSingle();
  if (shopError) {
    return NextResponse.json({ error: shopError.message }, { status: 500 });
  }
  const shopTimezone = shop?.timezone ?? "UTC";

  const toUtc = (local: string | undefined, label: string) => {
    const match =
      /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec(
        local?.trim() ?? "",
      );
    if (!match) {
      throw new Error(`A valid shop-local ${label} is required`);
    }
    return shopLocalDateTimeToUtc(match[1], match[2], shopTimezone);
  };

  if (body.correction_type === "adjust_punch") {
    if (!body.punch_id) return NextResponse.json({ error: "punch_id is required" }, { status: 400 });

    let correctedTimestamp: string;
    try {
      correctedTimestamp = toUtc(
        body.corrected_punch_local,
        "punch date and time",
      );
    } catch {
      return NextResponse.json({ error: "Invalid punch date or time for the shop timezone" }, { status: 400 });
    }

    const { data, error } = await admin.rpc("apply_punch_correction", {
      p_shop_id: me.shop_id,
      p_actor_profile_id: me.id,
      p_punch_id: body.punch_id,
      p_corrected_timestamp: correctedTimestamp,
      p_reason: reason,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, correction: data });
  }

  const needsShift = body.correction_type !== "create_missing_shift";
  if (needsShift && !body.shift_id) return NextResponse.json({ error: "shift_id is required" }, { status: 400 });

  let correctedStartTime = body.corrected_start_time;
  let correctedEndTime = body.corrected_end_time;
  try {
    if (body.corrected_start_local !== undefined) {
      correctedStartTime = toUtc(
        body.corrected_start_local,
        "shift start date and time",
      );
    }
    if (body.corrected_end_local !== undefined) {
      correctedEndTime = toUtc(
        body.corrected_end_local,
        "shift end date and time",
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid shift date or time for the shop timezone",
      },
      { status: 400 },
    );
  }

  if (body.correction_type === "create_missing_shift" && (!isIso(correctedStartTime) || !isIso(correctedEndTime))) {
    return NextResponse.json({ error: "corrected_start_time and corrected_end_time are required" }, { status: 400 });
  }
  if ((body.correction_type === "adjust_start" || body.correction_type === "adjust_start_and_end") && !isIso(correctedStartTime)) {
    return NextResponse.json({ error: "corrected_start_time is required" }, { status: 400 });
  }
  if ((body.correction_type === "adjust_end" || body.correction_type === "adjust_start_and_end") && !isIso(correctedEndTime)) {
    return NextResponse.json({ error: "corrected_end_time is required" }, { status: 400 });
  }
  if (
    isIso(correctedStartTime) &&
    isIso(correctedEndTime) &&
    new Date(correctedEndTime).getTime() <=
      new Date(correctedStartTime).getTime()
  ) {
    return NextResponse.json(
      { error: "Shift end must be after shift start" },
      { status: 400 },
    );
  }

  const { data, error } = await admin.rpc("apply_shift_correction", {
    p_shop_id: me.shop_id,
    p_actor_profile_id: me.id,
    p_target_user_id: body.target_user_id,
    p_shift_id: body.shift_id ?? null,
    p_correction_type: body.correction_type,
    p_corrected_start_time: correctedStartTime ?? null,
    p_corrected_end_time: correctedEndTime ?? null,
    p_reason: reason,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, correction: data });
}
