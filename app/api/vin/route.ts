import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerClient();
  const { vin, user_id } = await req.json();

  try {
    const vinRes = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`);
    const vinData = await vinRes.json();
    const decoded = vinData?.Results?.[0] || {};

    const { Year, Make, Model, Trim, EngineModel } = decoded;

    await supabase.from('vin_decodes').upsert({
      vin,
      user_id,
      year: Year,
      make: Make,
      model: Model,
      trim: Trim,
      engine: EngineModel,
    });

    return NextResponse.json({
      year: Year,
      make: Make,
      model: Model,
      trim: Trim,
      engine: EngineModel,
    });
  } catch (e: any) {
    console.error('VIN decode failed:', e);
    return NextResponse.json({ error: 'Failed to decode VIN' }, { status: 500 });
  }
}