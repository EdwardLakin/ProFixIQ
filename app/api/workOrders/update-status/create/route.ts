import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Generate a unique readable WO number like WO-20250716-1234
function generateWorkOrderNumber(): string {
  const date = new Date();
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `WO-${yyyymmdd}-${random}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customer_id,
      vehicle_id,
      inspection_id,
      type = 'maintenance',
      complaint,
      appointment,
      shop_id,
    } = body;

    // ✅ Validate required fields
    if (!customer_id || !vehicle_id || !type || !shop_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // ✅ Validate type field
    const validTypes = ['inspection', 'maintenance', 'diagnosis'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid work order type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const workOrderNumber = generateWorkOrderNumber();

    const { data, error } = await supabase
      .from('work_orders')
      .insert({
        vehicle_id,
        inspection_id: inspection_id ?? null,
        customer_id,
        status: 'queued',
        type,
        complaint: complaint ?? null,
        appointment: appointment ?? null,
        created_at: new Date().toISOString(),
        location: null,
        shop_id,
        number: workOrderNumber,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      return NextResponse.json(
        { error: 'Failed to insert work order' },
        { status: 500 }
      );
    }

    console.log('✅ Work order created:', data);

    return NextResponse.json({ success: true, workOrder: data });
  } catch (err) {
    console.error('❌ Unexpected error creating work order:', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    );
  }
}