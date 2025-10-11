"use server";

import { NextResponse } from "next/server";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type VinRequestBody = { vin?: string; user_id?: string };

type VpicResponse = {
  Results: Array<{
    Year?: string;
    Make?: string;
    Model?: string;
    Trim?: string;
    EngineModel?: string;
  }>;
};

export async function POST(req: Request) {
  let body: VinRequestBody;
  try {
    body = (await req.json()) as VinRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vin = (body.vin || "").trim().toUpperCase();
  const userId = body.user_id?.trim();

  if (vin.length !== 17) {
    return NextResponse.json({ error: "VIN must be 17 characters" }, { status: 400 });
  }

  // ── Fetch VIN decode from NHTSA (no API key needed)
  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "VIN API error" }, { status: 502 });
  }

  const data = (await res.json()) as VpicResponse;
  const r = data.Results?.[0] ?? {};

  const decoded = {
    year: r.Year || null,
    make: r.Make || null,
    model: r.Model || null,
    trim: r.Trim || null,
    engine: r.EngineModel || null,
  };

  // ── Use your unified RSC helper (no @supabase/ssr)
  try {
    const supabase = await createServerSupabaseRSC();

    if (userId) {
      const { error } = await supabase
        .from("vin_decodes")
        .upsert({
          vin,
          user_id: userId,
          ...decoded,
        } satisfies Database["public"]["Tables"]["vin_decodes"]["Insert"]);

      if (error) console.error("[vin upsert]", error);
    }
  } catch (err) {
    console.error("[vin save error]", err);
    // Don’t throw, still return decoded data
  }

  return NextResponse.json({ vin, ...decoded });
}