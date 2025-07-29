import { NextRequest, NextResponse } from 'next/server';
import { insertPrioritizedJobsFromInspection }from '@lib/work-orders/insertPrioritizedJobsFromInspection';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'; // ✅ Corrected
import { cookies } from 'next/headers';
import { Database } from '@/types/supabase';

export async function POST(req: NextRequest) {
  try {
    const { inspectionId, workOrderId, vehicleId } = await req.json();

    if (!inspectionId || !workOrderId || !vehicleId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerComponentClient<Database>({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await insertPrioritizedJobsFromInspection(
      inspectionId,
      workOrderId,
      vehicleId,
      user.id // ✅ Now works
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to insert jobs from inspection:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}