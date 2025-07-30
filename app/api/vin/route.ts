import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@/types/supabase';

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { vin, user_id } = await req.json();

  try {
    const vinRes = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`
    );
    const vinData = await vinRes.json();
    const decoded = vinData?.Results?.[0] || {};

    const { Year, Make, Model, Trim, EngineModel } = decoded;

    const { error } = await supabase.from('vin_decodes').upsert({
      vin,
      user_id,
      year: Year || null,
      make: Make || null,
      model: Model || null,
      trim: Trim || null,
      engine: EngineModel || null,
    });

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json({ error: 'Database insert failed' }, { status: 500 });
    }

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