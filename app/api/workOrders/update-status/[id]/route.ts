// app/api/workOrders/update-status/[id]/route.ts
export const runtime = 'nodejs';


import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch work order:', error);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}