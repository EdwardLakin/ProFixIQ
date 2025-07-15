// src/app/api/workOrders/create/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customer_id,
      vehicle_id,
      inspection_id,
      type,           // "diagnosis", "inspection", or "maintenance"
      complaint,      // optional string
      appointment,    // optional ISO string
      shop_id,        // added: must come from frontend or user profile
    }: {
      customer_id: string;
      vehicle_id: string;
      inspection_id?: string;
      type: 'diagnosis' | 'inspection' | 'maintenance';
      complaint?: string;
      appointment?: string;
      shop_id?: string;
    } = body;

    if (!customer_id || !vehicle_id || !type || !shop_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('work_orders')
      .insert([
        {
          vehicle_id,
          inspection_id: inspection_id ?? null,
          status: 'queued',
          created_at: new Date().toISOString(),
          location: null,
          shop_id,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, workOrder: data });
  } catch (err) {
    console.error('❌ Error creating work order:', err);
    return NextResponse.json({ error: 'Failed to create work order' }, { status: 500 });
  }
}