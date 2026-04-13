import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type TimeOffRow = {
  id?: string;
  start_date?: string;
  end_date?: string;
  starts_at?: string;
  ends_at?: string;
  label?: string | null;
  reason?: string | null;
  notes?: string | null;
};

type Body = {
  shopId?: string | null;
  entry?: TimeOffRow | null;
  range?: TimeOffRow | null;
  entries?: TimeOffRow[] | null;
  id?: string | null;
};

export async function GET() {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBranding",
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    const { data, error } = await access.supabase
      .from("shop_time_off")
      .select("*")
      .eq("shop_id", access.profile.shop_id)
      .order("start_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries = (data ?? []).map((row) => ({
      ...row,
      starts_at: row.start_date,
      ends_at: row.end_date,
      reason: row.label,
    }));

    return NextResponse.json({ entries, items: entries });
  } catch (err) {
    console.error("settings/time-off GET error", err);
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
    });
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => ({}))) as Body;
    const shopId = body.shopId?.trim() ?? access.profile.shop_id;

    if (!shopId || shopId !== access.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const entry = body.entry ?? body.range;
    const startDate = entry?.start_date ?? entry?.starts_at;
    const endDate = entry?.end_date ?? entry?.ends_at;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "entry.start_date and entry.end_date required" },
        { status: 400 }
      );
    }

    const { data, error } = await access.supabase
      .from("shop_time_off")
      .insert({
        shop_id: shopId,
        start_date: startDate,
        end_date: endDate,
        label: entry?.label ?? entry?.reason ?? null,
        notes: entry?.notes ?? null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entry: data });
  } catch (err) {
    console.error("settings/time-off POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBranding",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
    });
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => ({}))) as Body;
    const shopId = body.shopId?.trim() ?? access.profile.shop_id;
    const id = body.id?.trim() ?? "";

    if (!shopId || shopId !== access.profile.shop_id || !id) {
      return NextResponse.json({ error: "shopId and id required" }, { status: 400 });
    }

    const { error } = await access.supabase
      .from("shop_time_off")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/time-off DELETE error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
