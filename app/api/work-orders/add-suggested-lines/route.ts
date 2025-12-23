// app/api/work-orders/add-suggested-lines/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type JobType = "diagnosis" | "repair" | "maintenance" | "tech-suggested";

type IncomingItem = {
  description: string;
  serviceCode?: string;
  jobType?: JobType;
  laborHours?: number | null;
  notes?: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

function normalizeVehicleId(v?: string | null): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// --- parts request types ---
type PRInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PRIInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];

type PartRequestItemInsertWithExtras = PRIInsert & {
  markup_pct: number;
  work_order_line_id: string | null;
};

const DEFAULT_MARKUP = 30; // %

type ProfileLite = {
  id: string;
  user_id: string | null;
  shop_id: string | null;
};

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const body = (await req.json()) as {
      workOrderId: string;
      vehicleId?: string | null;
      odometerKm?: number | null;
      items: IncomingItem[];
    };

    const { workOrderId, vehicleId, odometerKm, items } = body;

    if (!workOrderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing workOrderId or items" },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }
    if (!user?.id) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // Read the WO (RLS applies)
    const { data: wo, error: woError } = await supabase
      .from("work_orders")
      .select("id, shop_id, odometer_km")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woError) {
      return NextResponse.json({ error: woError.message }, { status: 500 });
    }
    if (!wo) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const woShopId = (wo.shop_id as string | null) ?? null;
    if (!woShopId) {
      return NextResponse.json(
        {
          error:
            "Work order has no shop_id. This must be set before adding lines (RLS relies on it).",
        },
        { status: 409 },
      );
    }

    // Verify we have a profile row for this user (either id or user_id mapping)
    const { data: profileRow, error: profErr } = await supabase
      .from("profiles")
      .select("id, user_id, shop_id")
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    if (!profileRow) {
      return NextResponse.json(
        {
          error:
            "No profile row exists for this user. Create/restore profiles row (id=auth.uid or user_id=auth.uid) and link shop_id.",
        },
        { status: 403 },
      );
    }

    const profile = profileRow as unknown as ProfileLite;

    // Self-heal: if profile has no shop_id, attach them to this WO's shop
    if (!profile.shop_id) {
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ shop_id: woShopId })
        .or(`id.eq.${user.id},user_id.eq.${user.id}`);

      if (updErr) {
        return NextResponse.json(
          {
            error:
              updErr.message ??
              "Could not link your profile to this shop. Check profiles RLS.",
          },
          { status: 403 },
        );
      }
    } else if (profile.shop_id !== woShopId) {
      // Hard stop: if your profile is linked to a different shop, RLS insert will fail
      return NextResponse.json(
        {
          error:
            "Shop mismatch: your profile is linked to a different shop than this work order. Fix profiles.shop_id alignment.",
          details: {
            profile_shop_id: profile.shop_id,
            work_order_shop_id: woShopId,
          },
        },
        { status: 403 },
      );
    }

    // Optional but helpful: set shop context (won't harm; helps other reads in this request)
    // NOTE: this will only succeed if membership is aligned (which we ensured above)
    await supabase.rpc("set_current_shop_id", { p_shop_id: woShopId });

    const effectiveOdometerKm =
      odometerKm ?? ((wo.odometer_km as number | null) ?? null);

    const normalizedVehicleId = normalizeVehicleId(vehicleId ?? null);

    // Insert work_order_lines
    const lineRows = items.map((i) => ({
      work_order_id: workOrderId,
      vehicle_id: normalizedVehicleId,
      // shop_id is not required for your INSERT policy (policy checks parent WO + profile),
      // but keeping it consistent avoids future drift + helps SELECT policy patterns.
      shop_id: woShopId,
      description: (i.description ?? "").trim(),
      job_type: i.jobType ?? "maintenance",
      labor_time: typeof i.laborHours === "number" ? i.laborHours : 0,
      complaint: i.aiComplaint ?? null,
      cause: i.aiCause ?? null,
      correction: i.aiCorrection ?? null,
      status: "on_hold" as const,
      approval_state: "pending" as const,
      hold_reason: "Awaiting parts quote",
      service_code: i.serviceCode ?? null,
      odometer_km: effectiveOdometerKm,
      notes: i.notes ?? null,
    }));

    // Guard against empty descriptions
    if (lineRows.some((r) => !r.description)) {
      return NextResponse.json(
        { error: "One or more items had an empty description." },
        { status: 400 },
      );
    }

    const { data: insertedLines, error: insertError } = await supabase
      .from("work_order_lines")
      .insert(lineRows)
      .select("id, description");

    if (insertError || !insertedLines) {
      const msg = insertError?.message ?? "Failed to insert lines";
      // If this hits, it's almost always profile/shop misalignment or missing profile row.
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    // Create part_request + items
    const header: PRInsert = {
      work_order_id: workOrderId,
      shop_id: woShopId,
      requested_by: user.id,
      status: "requested",
      notes: "Auto-created from AI suggested services",
    };

    const { data: pr, error: prErr } = await supabase
      .from("part_requests")
      .insert(header)
      .select("id")
      .single();

    if (prErr || !pr?.id) {
      return NextResponse.json(
        { error: prErr?.message ?? "Failed to create part request" },
        { status: 500 },
      );
    }

    const itemRows: PartRequestItemInsertWithExtras[] = insertedLines.map((ln) => ({
      request_id: pr.id,
      description: (ln.description ?? "Service").trim(),
      qty: 1,
      approved: false,
      part_id: null,
      quoted_price: null,
      vendor: null,
      markup_pct: DEFAULT_MARKUP,
      work_order_line_id: ln.id,
    }));

    const { error: itemsErr } = await supabase
      .from("part_request_items")
      .insert(itemRows);

    if (itemsErr) {
      return NextResponse.json(
        { error: itemsErr.message ?? "Failed to insert part request items" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      inserted: lineRows.length,
      partRequestId: pr.id,
      partItems: itemRows.length,
    });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to add suggested lines" },
      { status: 500 },
    );
  }
}