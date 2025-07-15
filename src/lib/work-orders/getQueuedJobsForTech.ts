// src/lib/tech/getQueuedJobsForTech.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import type { JobLine } from '@lib/types';

export async function getQueuedJobsForTech(): Promise<JobLine[] | null> {
  const supabase = createClientComponentClient<Database>();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn('No authenticated user found');
    return null;
  }

  const { data, error } = await supabase
    .from('work_order_lines')
    .select(
      `
        id,
        status,
        complaint,
        punched_in_at,
        punched_out_at,
        hold_reason,
        work_order_id,
        vehicles (
          year,
          make,
          model
        ),
        assigned_tech:profiles (
          full_name,
          id
        )
      `
    )
    .or(`assigned_tech.eq.${user.id},assigned_tech.is.null`)
    .order('created_at', { ascending: true });

  if (error || !data) {
    console.error('❌ Error fetching queued jobs for tech:', error);
    return null;
  }

  const jobLines: JobLine[] = data.map((row: any) => ({
    id: row.id,
    status: row.status,
    complaint: row.complaint,
    punched_in_at: row.punched_in_at,
    punched_out_at: row.punched_out_at,
    hold_reason: row.hold_reason,
    work_order_id: row.work_order_id,
    created_at: row.created_at,
    vehicle_year: row.vehicles?.year ?? null,
    vehicle_make: row.vehicles?.make ?? null,
    vehicle_model: row.vehicles?.model ?? null,
    assigned_tech_full_name: row.assigned_tech?.full_name ?? null,
  }));

  return jobLines;
}