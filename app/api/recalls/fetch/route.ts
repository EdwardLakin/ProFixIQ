// app/api/recalls/fetch/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Run on Node so env vars are available (not Edge) */
export const runtime = "nodejs";
/** Ensure it isn't statically rendered */
export const dynamic = "force-dynamic";

type NhtsaRecall = {
  NHTSACampaignNumber?: string;
  campaignNumber?: string;
  ReportReceivedDate?: string;
  ReportDate?: string;
  Component?: string;
  Summary?: string;
  Conequence?: string;
  Consequence?: string;
  Remedy?: string;
  Notes?: string;
  Manufacturer?: string;
};

export async function POST(req: Request) {
  try {
    // Resolve env at runtime (Node), prefer non-public URL if present
    const SUPABASE_URL =
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server is missing Supabase environment variables." },
        { status: 500 }
      );
    }

    // Create a server-side Supabase client using the service role (never on the client!)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = (await req.json()) as {
      vin?: string;
      year?: string;
      make?: string;
      model?: string;
      user_id?: string;
    };

    const { vin, year, make, model, user_id } = body;

    if (!vin) {
      return NextResponse.json({ error: "VIN required" }, { status: 400 });
    }

    // Fetch from NHTSA Recall API
    const params = new URLSearchParams({
      make: make ?? "",
      model: model ?? "",
      modelYear: year ?? "",
    });

    const res = await fetch(
      `https://api.nhtsa.gov/recalls/recallsByVehicle?${params.toString()}`,
      { headers: { "Content-Type": "application/json" }, cache: "no-store" }
    );

    if (!res.ok) throw new Error(`NHTSA error ${res.status}`);
    const data = (await res.json()) as { results?: NhtsaRecall[] };
    const results = data.results ?? [];

    // Prepare upserts for vehicle_recalls
    const now = new Date().toISOString();
    const records = results.map((r) => ({
      vin,
      campaign_number: r.NHTSACampaignNumber ?? r.campaignNumber ?? "UNKNOWN",
      report_date: r.ReportReceivedDate ?? r.ReportDate ?? null,
      component: r.Component ?? null,
      summary: r.Summary ?? null,
      consequence: r.Conequence ?? r.Consequence ?? null,
      remedy: r.Remedy ?? null,
      notes: r.Notes ?? null,
      manufacturer: r.Manufacturer ?? null,
      make: make ?? null,
      model: model ?? null,
      model_year: year ?? null,
      user_id: user_id ?? null,
      created_at: now,
    }));

    if (records.length > 0) {
      const { error } = await supabase
        .from("vehicle_recalls")
        .upsert(records, { onConflict: "vin,campaign_number" });

      if (error) throw error;
    }

    return NextResponse.json({ count: records.length, status: "ok" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Recall fetch error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}