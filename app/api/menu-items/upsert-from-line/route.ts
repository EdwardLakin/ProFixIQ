import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

/*
-- Suggested table
create table if not exists saved_menu_items (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  year_bucket text not null, -- e.g. "2015-2018" or "2019-2021"
  title text not null,       -- normalized job title
  labor_time numeric,        -- default hours
  parts jsonb not null default '[]',  -- [{part_id, qty}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists saved_menu_items_uq
  on saved_menu_items(make, model, year_bucket, title);
*/

interface Body {
  workOrderLineId: string;
}

function isBody(x: unknown): x is Body {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.workOrderLineId === "string";
}

function yearBucket(y?: number | null): string {
  if (!y || Number.isNaN(y)) return "unknown";
  // e.g. 2015-2018, 2019-2021, etc. (3-year buckets)
  const start = y - ((y - 1) % 3);
  const end = start + 2;
  return `${start}-${end}`;
}

export async function POST(req: Request) {
  try {
    const bUnknown: unknown = await req.json();
    if (!isBody(bUnknown)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { workOrderLineId } = bUnknown;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }
    const sb = createClient<DB>(supabaseUrl, serviceKey);

    // Line
    const { data: line, error: le } = await sb
      .from("work_order_lines").select("*")
      .eq("id", workOrderLineId)
      .maybeSingle<DB["public"]["Tables"]["work_order_lines"]["Row"]>();
    if (le || !line) {
      return NextResponse.json({ error: le?.message ?? "Line not found" }, { status: 404 });
    }

    // Parent WO => vehicle
    const { data: wo } = await sb
      .from("work_orders").select("*")
      .eq("id", line.work_order_id)
      .maybeSingle<DB["public"]["Tables"]["work_orders"]["Row"]>();
    const { data: vehicle } = wo?.vehicle_id
      ? await sb.from("vehicles").select("*").eq("id", wo.vehicle_id)
          .maybeSingle<DB["public"]["Tables"]["vehicles"]["Row"]>()
      : { data: null };

    const make = (vehicle?.make ?? "").trim();
    const model = (vehicle?.model ?? "").trim();
    const year = typeof vehicle?.year === "number"
      ? vehicle?.year
      : Number((vehicle?.year as unknown as string) ?? NaN);
    const yBucket = yearBucket(year);

    // Sanity: “fully quoted” = has labor_time OR has at least one allocation
    const { data: allocs } = await sb
      .from("work_order_part_allocations")
      .select("part_id, qty")
      .eq("work_order_line_id", workOrderLineId);

    const fullyQuoted = (line.labor_time !== null && line.labor_time !== undefined)
      || ((allocs ?? []).length > 0);

    if (!make || !model || !fullyQuoted) {
      return NextResponse.json({ error: "Line not fully quoted or vehicle missing" }, { status: 400 });
    }

    // Normalize a job title
    const rawTitle = (line.description ?? line.complaint ?? "Repair").trim();
    const title = rawTitle.replace(/\s+/g, " ").replace(/\.$/, "");

    // Upsert saved_menu_items
    const partsJson = (allocs ?? []).map(a => ({ part_id: a.part_id, qty: a.qty }));
    const insert = {
      make,
      model,
      year_bucket: yBucket,
      title,
      labor_time: line.labor_time ?? null,
      parts: partsJson as unknown as NonNullable<DB["public"]["Tables"]["saved_menu_items"]["Row"]["parts"]>,
      updated_at: new Date().toISOString(),
    };

    // NOTE: upsert based on the unique index (make, model, year_bucket, title)
    const { data, error } = await sb
      .from("saved_menu_items")
      .upsert(insert, { onConflict: "make,model,year_bucket,title" })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id ?? null, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}