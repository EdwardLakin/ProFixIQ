import { NextResponse } from 'next/server';
import { mapCsvColumns } from '@lib/ai/mapColumns';

export async function POST(req: Request) {
  const { headers } = await req.json();

  if (!headers || !Array.isArray(headers)) {
    return NextResponse.json({ error: 'Missing headers array' }, { status: 400 });
  }

  try {
    const mapping = await mapCsvColumns(headers);
    return NextResponse.json({ mapping });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to map columns' }, { status: 500 });
  }
}