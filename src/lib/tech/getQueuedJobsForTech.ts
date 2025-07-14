// src/lib/tech/getQueuedJobsForTech.ts
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

export type JobLine = {
  id: string;
  status: 'awaiting' | 'in_progress' | 'on_hold' | 'completed';
  complaint: string | null;
  created_at: string;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
  hold_reason?: string | null;
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  };
  assigned_to?: {
    full_name?: string | null;
  };
};

// Matches the raw shape returned from Supabase including joins
type RawJobLine = {
  id: string;
  status: JobLine['status'];
  complaint: string | null;
  created_at: string;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
  hold_reason?: string | null;
  vehicle: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  } | null;
  assigned_to: {
    full_name?: string | null;
  } | null;
};

export async function getQueuedJobsForTech(): Promise<JobLine[] | null> {
  const supabase = createServerComponentClient<Database>({ cookies });

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
        created_at,
        punched_in_at,
        punched_out_at,
        hold_reason,
        vehicle:vehicle_id (
          year,
          make,
          model
        ),
        assigned_to:assigned_to (
          full_name
        )
      `
    )
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Error fetching jobs:', error?.message);
    return null;
  }

  return (data as RawJobLine[]).map((job) => ({
    id: job.id,
    status: job.status,
    complaint: job.complaint,
    created_at: job.created_at,
    punched_in_at: job.punched_in_at ?? null,
    punched_out_at: job.punched_out_at ?? null,
    hold_reason: job.hold_reason ?? null,
    vehicle: job.vehicle ?? undefined,
    assigned_to: job.assigned_to ?? undefined,
  }));
}