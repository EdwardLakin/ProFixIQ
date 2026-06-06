import { NextResponse } from "next/server";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";

function uniqStrings(list: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of list) {
    const text = (value ?? "").toString().trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function toIsoStartOfDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
}

function toIsoEndOfDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user || !actor.shopId) {
    console.info("[InspectionHistory] server auth unavailable", {
      actorPresent: Boolean(actor.user),
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/inspections/history",
      table: "inspections",
    });
    return NextResponse.json({ error: "You must be signed in to view inspection history." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  let query = supabase
    .from("inspections")
    .select(
      `
        id,
        shop_id,
        vehicle_id,
        work_order_id,
        status,
        summary,
        created_at,
        updated_at,
        pdf_url,
        pdf_storage_path,
        vehicles:vehicles(year,make,model,vin,license_plate,unit_number),
        inspection_templates:inspection_templates(template_name,description)
      `,
    )
    .eq("shop_id", actor.shopId)
    .order("created_at", { ascending: false })
    .limit(400);

  if (from) query = query.gte("created_at", toIsoStartOfDay(from));
  if (to) query = query.lte("created_at", toIsoEndOfDay(to));

  const { data: baseData, error: baseErr } = await query;

  if (baseErr) {
    console.info("[InspectionHistory] inspections query failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/inspections/history",
      table: "inspections",
      code: baseErr.code,
      message: baseErr.message,
    });
    return NextResponse.json({ error: baseErr.message }, { status: 500 });
  }

  const baseList = Array.isArray(baseData) ? baseData : [];
  const workOrderIds = uniqStrings(baseList.map((row) => row.work_order_id));
  const woMap = new Map<string, { id: string; custom_id: string | null; status: string | null; customer_id: string | null }>();
  const custMap = new Map<string, { id: string; first_name: string | null; last_name: string | null; business_name: string | null }>();

  if (workOrderIds.length > 0) {
    const { data: workOrders, error: woErr } = await supabase
      .from("work_orders")
      .select("id, custom_id, status, customer_id")
      .eq("shop_id", actor.shopId)
      .in("id", workOrderIds);

    if (woErr) {
      console.info("[InspectionHistory] work_orders query failed", {
        actorPresent: true,
        profileId: actor.profile?.id ?? null,
        profileRole: actor.role ?? null,
        activeShopId: actor.shopId,
        route: "/api/inspections/history",
        table: "work_orders",
        code: woErr.code,
        message: woErr.message,
      });
    } else {
      for (const workOrder of workOrders ?? []) if (workOrder.id) woMap.set(workOrder.id, workOrder);

      const customerIds = uniqStrings((workOrders ?? []).map((workOrder) => workOrder.customer_id));
      if (customerIds.length > 0) {
        const { data: customers, error: custErr } = await supabase
          .from("customers")
          .select("id, first_name, last_name, business_name")
          .eq("shop_id", actor.shopId)
          .in("id", customerIds);

        if (custErr) {
          console.info("[InspectionHistory] customers query failed", {
            actorPresent: true,
            profileId: actor.profile?.id ?? null,
            profileRole: actor.role ?? null,
            activeShopId: actor.shopId,
            route: "/api/inspections/history",
            table: "customers",
            code: custErr.code,
            message: custErr.message,
          });
        } else {
          for (const customer of customers ?? []) if (customer.id) custMap.set(customer.id, customer);
        }
      }
    }
  }

  const rows = baseList.map((row) => {
    const workOrder = row.work_order_id ? woMap.get(row.work_order_id) : undefined;
    const customer = workOrder?.customer_id ? custMap.get(workOrder.customer_id) : undefined;
    return {
      ...row,
      work_orders: workOrder
        ? {
            ...workOrder,
            customers: customer
              ? {
                  first_name: customer.first_name,
                  last_name: customer.last_name,
                  business_name: customer.business_name,
                }
              : null,
          }
        : null,
    };
  });

  return NextResponse.json({ rows });
}
