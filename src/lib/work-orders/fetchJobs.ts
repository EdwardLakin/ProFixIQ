import supabase from '@lib/supabaseClient';
import { JobLine } from '@lib/types';
import type { Database } from '@/types/supabase';

// Create a helper type to include joined `vehicles` and `profiles`
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
  const { data, error } = await supabase
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
    `) as unknown as { data: WorkOrderLineWithJoins[]; error: any };

  if (error || !data) {
    console.error('❌ Error fetching job lines:', error);
    return [];
  }

  return data.map((row): JobLine => ({
    id: row.id ?? '',
    status: row.status as JobLine['status'], // cast due to broader Supabase type
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