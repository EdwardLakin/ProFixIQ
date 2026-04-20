import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";

type HourInput = {
  weekday?: number;
  day_of_week?: number;
  open_time?: string | null;
  close_time?: string | null;
  closed?: boolean;
  is_closed?: boolean | null;
};

type Body = {
  shopId?: string | null;
  hours?: HourInput[] | null;
};

export async function GET() {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBranding",
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    const { data, error } = await access.supabase
      .from("shop_hours")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("shop_id", access.profile.shop_id)
      .order("day_of_week", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      hours: (data ?? []).map((row) => ({
        weekday: row.day_of_week,
        open_time: row.open_time,
        close_time: row.close_time,
        closed: !!row.is_closed,
      })),
    });
  } catch (err) {
    console.error("settings/hours GET error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBranding",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS, OWNER_PIN_PURPOSES.PRIVILEGED],
    });
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => ({}))) as Body;
    const shopId = body.shopId?.trim() ?? access.profile.shop_id;

    if (!shopId || shopId !== access.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hours = Array.isArray(body.hours) ? body.hours : [];

    const normalized = hours.map((row) => {
      const dayOfWeek = Number.isFinite(row.weekday)
        ? Number(row.weekday)
        : Number(row.day_of_week);
      const isClosed = Boolean(row.closed ?? row.is_closed);

      return {
        shop_id: shopId,
        day_of_week: dayOfWeek,
        open_time: isClosed ? null : row.open_time ?? null,
        close_time: isClosed ? null : row.close_time ?? null,
        is_closed: isClosed,
      };
    });

    const { error: deleteErr } = await access.supabase
      .from("shop_hours")
      .delete()
      .eq("shop_id", shopId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    if (normalized.length > 0) {
      const { error: insertErr } = await access.supabase.from("shop_hours").insert(normalized);
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/hours POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
