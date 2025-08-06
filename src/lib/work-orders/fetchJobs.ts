import supabase from '@lib/supabaseClient';
import { JobLine } from '@lib/types';
import type { Database } from '@/types/supabase';
import type { PostgrestResponse } from '@supabase/supabase-js';

// Extend the row to include joins
type WorkOrderLineWithJoins = Database['public']['Tables']['work_order_lines']['Row'] & {
  vehicles?: {
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;
  profiles?: {
    full_name: string | null;
  } | null;
};

export async function fetchAllJobLines(): Promise<JobLine[]> {
  const response: PostgrestResponse<WorkOrderLineWithJoins> = await supabase
    .from('work_order_lines')
    .select(`
      id,
      status,
      complaint,
      punched_in_at,
      punched_out_at,
      hold_reason,
      created_at,
      vehicles (
        year,
        make,
        model
      ),
      profiles:assigned_to (
        full_name
      )
    `);

  if (response.error || !response.data) {
    console.error('❌ Error fetching job lines:', response.error);
    return [];
  }

  return response.data.map((row): JobLine => ({
    id: row.id ?? '',
    status: row.status as JobLine['status'],
    complaint: row.complaint ?? null,
    punched_in_at: row.punched_in_at ?? null,
    punched_out_at: row.punched_out_at ?? null,
    hold_reason: row.hold_reason ?? null,
    created_at: row.created_at ?? '',
    vehicle: {
      year: row.vehicles?.year ?? undefined,
      make: row.vehicles?.make ?? undefined,
      model: row.vehicles?.model ?? undefined,
    },
    assigned_to: {
      full_name: row.profiles?.full_name ?? undefined,
    },
  }));
}