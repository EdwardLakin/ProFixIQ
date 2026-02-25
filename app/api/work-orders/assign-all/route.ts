// app/api/work-orders/assign-all/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  work_order_id: string;
  tech_id: string;
  // optional, defaults to true → only update rows where assigned_tech_id is null
  only_unassigned?: boolean;
};

type LineTechInsert = {
  work_order_line_id: string;
  technician_id: string;
  assigned_by?: string | null;
};

const STAFF_CAN_ASSIGN = new Set(["owner", "admin", "manager", "advisor", "dispatcher"]);

function isStaffRole(role: unknown): boolean {
  return STAFF_CAN_ASSIGN.has(String(role ?? "").toLowerCase());
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const body = (await req.json()) as Partial<Body>;
    const { work_order_id, tech_id, only_unassigned = true } = body;

    if (!work_order_id) {
      return NextResponse.json({ error: "work_order_id is required" }, { status: 400 });
    }
    if (!tech_id) {
      return NextResponse.json({ error: "tech_id is required" }, { status: 400 });
    }

    // Auth (do NOT trust client for who is assigning)
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const assigned_by = user.id; // Option A: profiles.id == auth.uid()

    // Load caller profile (shop + role)
    const { data: caller, error: callerErr } = await supabase
      .from("profiles")
      .select("id, shop_id, role")
      .eq("id", assigned_by)
      .maybeSingle();

    if (callerErr) {
      return NextResponse.json({ error: callerErr.message }, { status: 400 });
    }
    if (!caller?.shop_id) {
      return NextResponse.json({ error: "Profile missing shop_id" }, { status: 403 });
    }
    if (!isStaffRole(caller.role)) {
      return NextResponse.json({ error: "Forbidden: role cannot assign work" }, { status: 403 });
    }

    // Load WO + verify same shop
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", work_order_id)
      .maybeSingle();

    if (woErr) {
      return NextResponse.json({ error: woErr.message }, { status: 400 });
    }
    if (!wo) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }
    if (wo.shop_id !== caller.shop_id) {
      return NextResponse.json({ error: "Forbidden: cross-shop assignment" }, { status: 403 });
    }

    // Load tech profile + verify same shop
    const { data: techProfile, error: techErr } = await supabase
      .from("profiles")
      .select("id, role, full_name, shop_id")
      .eq("id", tech_id)
      .maybeSingle();

    if (techErr) {
      return NextResponse.json({ error: `Failed to load tech profile: ${techErr.message}` }, { status: 400 });
    }
    if (!techProfile) {
      return NextResponse.json({ error: "Tech profile not found for that id." }, { status: 404 });
    }
    if (techProfile.shop_id !== caller.shop_id) {
      return NextResponse.json({ error: "Tech is not in the same shop." }, { status: 403 });
    }

    // Update work_order_lines (set BOTH assigned_tech_id and assigned_tech_id)
    // assigned_tech_id is used by punch_in/out functions in DB
    let query = supabase
      .from("work_order_lines")
      .update({ assigned_tech_id: tech_id, assigned_tech_id: tech_id })
      .eq("work_order_id", work_order_id);

    if (only_unassigned) {
      query = query.is("assigned_tech_id", null);
    }

    const { data: updatedRows, error: updErr } = await query.select("id");

    if (updErr) {
      return NextResponse.json({ error: `Update failed: ${updErr.message}` }, { status: 400 });
    }

    // Keep many-to-many table in sync (non-fatal if it fails)
    if (updatedRows && updatedRows.length > 0) {
      const linkRows: LineTechInsert[] = updatedRows.map((row) => ({
        work_order_line_id: row.id,
        technician_id: tech_id,
        assigned_by,
      }));

      const { error: linkErr } = await supabase
        .from("work_order_line_technicians")
        .upsert(linkRows, {
          onConflict: "work_order_line_id,technician_id",
        });

      if (linkErr) {
        console.warn("assign-all: failed to upsert work_order_line_technicians:", linkErr.message);
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