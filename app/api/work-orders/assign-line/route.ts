// app/api/work-orders/assign-line/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      work_order_line_id?: string;
      tech_id?: string;
    };

    const lineId = body.work_order_line_id;
    const techId = body.tech_id;
    const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
    if (!access.ok) return access.response;
    const assignedBy = access.profile.id;
    const shopId = access.profile.shop_id;

    if (!lineId || !techId) {
      return NextResponse.json(
        { error: "work_order_line_id and tech_id are required" },
        { status: 400 }
      );
    }

    const url = must("NEXT_PUBLIC_SUPABASE_URL");
    const service = must("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient<DB>(url, service);

    const { data: line, error: lineReadErr } = await supabase
      .from("work_order_lines")
      .select("id, line_type, work_order_id, work_orders!inner(id, shop_id)")
      .eq("id", lineId)
      .eq("work_orders.shop_id", shopId)
      .maybeSingle();

    if (lineReadErr) {
      return NextResponse.json({ error: lineReadErr.message }, { status: 400 });
    }
    if (!line) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }
    if ((line.line_type ?? "job") === "info") {
      return NextResponse.json({ error: "Info lines cannot be technician-assigned." }, { status: 409 });
    }

    const { data: technician, error: technicianErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", techId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (technicianErr) {
      return NextResponse.json({ error: technicianErr.message }, { status: 400 });
    }
    if (!technician) {
      return NextResponse.json({ error: "Technician not found" }, { status: 404 });
    }

    // 1) keep the simple column up to date
    const { error: lineErr } = await supabase
      .from("work_order_lines")
      .update({ assigned_tech_id: techId })
      .eq("id", lineId)
      .eq("work_order_id", line.work_order_id);

    if (lineErr) {
      return NextResponse.json({ error: lineErr.message }, { status: 400 });
    }

    // 2) also record in the 1..n table (ignore duplicates)
    const { error: relErr } = await supabase
      .from("work_order_line_technicians")
      .upsert(
        {
          work_order_line_id: lineId,
          technician_id: techId,
          assigned_by: assignedBy,
        },
        {
          // because you declared unique (work_order_line_id, technician_id)
          onConflict: "work_order_line_id,technician_id",
        }
      );

    if (relErr) {
      // not fatal for UI
      console.warn("assign-line: technician link failed:", relErr.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
