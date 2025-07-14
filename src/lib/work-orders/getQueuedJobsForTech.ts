import supabase from '@lib/supabaseClient';
import { JobLine } from '@lib/types';

export async function getQueuedJobsForTech(userId?: string): Promise<JobLine[]> {
  const { data, error } = await supabase
    .from('work_order_lines')
    .select(`
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
    `)
    .eq('status', 'awaiting') // Only fetch awaiting jobs
    .or(`assigned_tech.id.eq.${userId},assigned_tech.id.is.null`) // Jobs unassigned or assigned to current tech
    .order('punched_in_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching queued jobs for tech:', error);
    return [];
  }

  return (
    data?.map((row: any) => ({
      id: row.id,
      status: row.status,
      complaint: row.complaint,
      punched_in_at: row.punched_in_at,
      punched_out_at: row.punched_out_at,
      hold_reason: row.hold_reason,
      work_order_id: row.work_order_id,
      vehicle_year: row.vehicles?.year ?? null,
      vehicle_make: row.vehicles?.make ?? null,
      vehicle_model: row.vehicles?.model ?? null,
      assigned_tech_full_name: row.assigned_tech?.full_name ?? null,
    })) ?? []
  );
}