import { NextRequest, NextResponse } from 'next/server';
import { insertPrioritizedJobsFromInspection } from '@lib/work-orders/insertPrioritizedJobsFromInspection';

export async function POST(req: NextRequest) {
  try {
    const { inspectionId, workOrderId, vehicleId } = await req.json();

    if (!inspectionId || !workOrderId || !vehicleId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await insertPrioritizedJobsFromInspection(inspectionId, workOrderId, vehicleId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to insert jobs from inspection:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}