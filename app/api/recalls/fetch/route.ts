import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Minimal Supabase server client (non-SSR)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const body = await req.json();
    const { vin, year, make, model, user_id } = body as {
      vin?: string;
      year?: string;
      make?: string;
      model?: string;
      user_id?: string;
    };

    if (!vin) {
      return NextResponse.json({ error: "VIN required" }, { status: 400 });
    }

    // 🔹 Fetch from NHTSA Recall API
    const res = await fetch(
      `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${make ?? ""}&model=${model ?? ""}&modelYear=${year ?? ""}`,
      { headers: { "Content-Type": "application/json" } }
    );

    if (!res.ok) throw new Error(`NHTSA error ${res.status}`);
    const data = (await res.json()) as { results?: NhtsaRecall[] };
    const results = data.results ?? [];

    // 🔹 Prepare upserts
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
      make,
      model,
      model_year: year,
      user_id,
      created_at: new Date().toISOString(),
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