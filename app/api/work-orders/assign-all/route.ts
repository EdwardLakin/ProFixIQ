// app/api/work-orders/assign-all/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Body = {
  work_order_id: string;
  tech_id: string;
  // optional, defaults to true → only update rows where assigned_to is null
  only_unassigned?: boolean;
  // optional: who is doing the assignment (profiles.id)
  assigned_by?: string | null;
};

type LineTechInsert = {
  work_order_line_id: string;
  technician_id: string;
  assigned_by?: string | null;
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const {
      work_order_id,
      tech_id,
      only_unassigned = true,
      assigned_by = null,
    } = (await req.json()) as Partial<Body>;

    if (!work_order_id) {
      return NextResponse.json(
        { error: "work_order_id is required" },
        { status: 400 }
      );
    }
    if (!tech_id) {
      return NextResponse.json(
        { error: "tech_id is required" },
        { status: 400 }
      );
    }

    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient<Database>(url, service);

    // (optional) make sure tech exists + is a tech-ish role
    const { data: techProfile, error: techErr } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", tech_id)
      .maybeSingle();

    if (techErr) {
      return NextResponse.json(
        { error: `Failed to load tech profile: ${techErr.message}` },
        { status: 400 }
      );
    }
    if (!techProfile) {
      return NextResponse.json(
        { error: "Tech profile not found for that id." },
        { status: 404 }
      );
    }

    // build update
    let query = supabase
      .from("work_order_lines")
      .update({ assigned_to: tech_id })
      .eq("work_order_id", work_order_id);

    if (only_unassigned) {
      query = query.is("assigned_to", null);
    }

    // we SELECT ids so we know which lines were actually changed
    const { data: updatedRows, error: updErr } = await query.select("id");

    if (updErr) {
      return NextResponse.json(
        { error: `Update failed: ${updErr.message}` },
        { status: 400 }
      );
    }

    // NEW: also reflect this in work_order_line_technicians (many-to-many)
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

      // not fatal — we still assigned the lines
      if (linkErr) {
        // you can log this to your logs if you want
        console.warn(
          "assign-all: failed to upsert work_order_line_technicians:",
          linkErr.message
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