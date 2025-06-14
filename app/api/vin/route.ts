import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { vin } = await req.json();
    if (!vin || vin.length < 11) {
      return NextResponse.json({ error: 'Invalid VIN' }, { status: 400 });
    }

    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`
    );

    if (!res.ok) throw new Error('Failed to fetch VIN data');

    const data = await res.json();
    const decoded = data.Results[0];

    const vehicle = {
      year: decoded.ModelYear,
      make: decoded.Make,
      model: decoded.Model,
    };

    return NextResponse.json(vehicle);
  } catch (error) {
    console.error('VIN Decode Error:', error);
    return NextResponse.json({ error: 'VIN decoding failed' }, { status: 500 });
  }
}