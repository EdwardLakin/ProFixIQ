import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/supabase";

interface VinDecodeRequestBody {
  vin: string;
  user_id: string;
}

interface VinDecodeResponse {
  Results: Array<{
    Year: string;
    Make: string;
    Model: string;
    Trim: string;
    EngineModel: string;
  }>;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  let body: VinDecodeRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { vin, user_id } = body;

  try {
    const vinRes = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`,
    );

    if (!vinRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch from VIN API" },
        { status: 502 },
      );
    }

    const vinData: VinDecodeResponse = await vinRes.json();
    const decoded = vinData?.Results?.[0] || {};

    const { Year, Make, Model, Trim, EngineModel } = decoded;

    const { error } = await supabase.from("vin_decodes").upsert({
      vin,
      user_id,
      year: Year || null,
      make: Make || null,
      model: Model || null,
      trim: Trim || null,
      engine: EngineModel || null,
    });

    if (error) {
      console.error("❌ Supabase upsert error:", error);
      return NextResponse.json(
        { error: "Database insert failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      year: Year,
      make: Make,
      model: Model,
      trim: Trim,
      engine: EngineModel,
    });
  } catch (err) {
    console.error("❌ VIN decode failed:", err);
    return NextResponse.json(
      { error: "Failed to decode VIN" },
      { status: 500 },
    );
  }
}
