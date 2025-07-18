// src/app/api/work-orders/from-inspection.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import supabase from '@lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { inspectionId, workOrderId, vehicleId } = req.body;

    if (!inspectionId || !workOrderId || !vehicleId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const inspectionRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/inspections/${inspectionId}`);
    const inspection = await inspectionRes.json();

    // Explicitly typed array of job lines
    const jobsToInsert: {
      work_order_id: string;
      job_type: string;
      name: string;
      status: string;
      labor_time?: number;
      notes?: string;
      recommendation?: string;
    }[] = [];

    // Extract failed or recommended items
    inspection.result.sections.forEach((section: any) => {
      section.items.forEach((item: any) => {
        if (item.status === 'fail' || item.recommend) {
          jobsToInsert.push({
            work_order_id: workOrderId,
            job_type: 'inspection-fail',
            name: item.name,
            recommendation: item.recommend,
            notes: item.notes,
            status: 'not_started',
            labor_time: 0, // Placeholder for AI-generated labor time
          });
        }
      });
    });

    if (jobsToInsert.length === 0) {
      return res.status(200).json({ message: 'No fail/recommend items found' });
    }

    const { error: insertError } = await supabase
      .from('work_order_lines')
      .insert(jobsToInsert);

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to insert job lines' });
    }

    return res.status(200).json({ success: true, inserted: jobsToInsert.length });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}