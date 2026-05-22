// app/api/work-orders/assign-all/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type Body = {
  work_order_id: string;
  tech_id: string;
  only_unassigned?: boolean;
};

type LineTechInsert = {
  work_order_line_id: string;
  technician_id: string;
  assigned_by?: string | null;
};

const ASSIGNABLE_ROLES = new Set([
  "mechanic",
  "tech",
  "foreman",
  "lead_hand",
]);

function isAssignableRole(role: unknown): boolean {
  return ASSIGNABLE_ROLES.has(String(role ?? "").toLowerCase());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const { work_order_id, tech_id, only_unassigned = true } = body;

    if (!work_order_id) {
      return NextResponse.json(
        { error: "work_order_id is required" },
        { status: 400 },
      );
    }

    if (!tech_id) {
      return NextResponse.json(
        { error: "tech_id is required" },
        { status: 400 },
      );
    }

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageWorkOrders",
    });
    if (!access.ok) return access.response;

    const admin = await createAdminSupabase();
    const assigned_by = access.profile.id;
    const shopId = access.profile.shop_id;

    // Work order: use admin client
    const { data: wo, error: woErr } = await admin
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", work_order_id)
      .maybeSingle();

    if (woErr) {
      return NextResponse.json({ error: woErr.message }, { status: 400 });
    }

    if (!wo) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 },
      );
    }

    if (wo.shop_id !== shopId) {
      return NextResponse.json(
        { error: "Forbidden: cross-shop assignment" },
        { status: 403 },
      );
    }

    // Tech profile: use admin client
    const { data: techProfile, error: techErr } = await admin
      .from("profiles")
      .select("id, role, full_name, shop_id")
      .eq("id", tech_id)
      .maybeSingle();

    if (techErr) {
      return NextResponse.json(
        { error: `Failed to load tech profile: ${techErr.message}` },
        { status: 400 },
      );
    }

    if (!techProfile) {
      return NextResponse.json(
        { error: "Tech profile not found for that id." },
        { status: 404 },
      );
    }

    if (techProfile.shop_id !== shopId) {
      return NextResponse.json(
        { error: "Tech is not in the same shop." },
        { status: 403 },
      );
    }

    if (!isAssignableRole(techProfile.role)) {
      return NextResponse.json(
        { error: "Selected profile is not assignable." },
        { status: 400 },
      );
    }

    let updateQuery = admin
      .from("work_order_lines")
      .update({ assigned_tech_id: tech_id })
      .eq("work_order_id", work_order_id)
      .eq("line_type", "job");

    if (only_unassigned) {
      updateQuery = updateQuery.is("assigned_tech_id", null);
    }

    const { data: updatedRows, error: updErr } = await updateQuery
      .select("id");

    if (updErr) {
      return NextResponse.json(
        { error: `Update failed: ${updErr.message}` },
        { status: 400 },
      );
    }

    if (updatedRows && updatedRows.length > 0) {
      const linkRows: LineTechInsert[] = updatedRows.map((row) => ({
        work_order_line_id: row.id,
        technician_id: tech_id,
        assigned_by,
      }));

      const { error: linkErr } = await admin
        .from("work_order_line_technicians")
        .upsert(linkRows, {
          onConflict: "work_order_line_id,technician_id",
        });

      if (linkErr) {
        console.warn(
          "assign-all: failed to upsert work_order_line_technicians:",
          linkErr.message,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      updated_count: updatedRows?.length ?? 0,
      tech: {
        id: techProfile.id,
        role: techProfile.role,
        full_name: techProfile.full_name,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
