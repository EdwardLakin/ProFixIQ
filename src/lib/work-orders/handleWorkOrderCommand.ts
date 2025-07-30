import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export async function handleWorkOrderCommand(
  command: any,
  supabase: SupabaseClient<Database>,
  user: Database['public']['Tables']['profiles']['Row']
): Promise<string> {
  switch (command.type) {
    case 'start_job':
      await supabase
        .from('work_order_lines')
        .update({
          status: 'in_progress',
          punched_in_at: new Date().toISOString(),
        })
        .eq('id', command.jobId);

      return `Started job ${command.jobId}`;

    case 'complete_job':
      await supabase
        .from('work_order_lines')
        .update({
          status: 'completed',
          punched_out_at: new Date().toISOString(),
        })
        .eq('id', command.jobId);

      return `Completed job ${command.jobId}`;

    case 'put_on_hold':
      await supabase
        .from('work_order_lines')
        .update({
          status: 'on_hold',
          punched_out_at: new Date().toISOString(),
          hold_reason: command.reason ?? '',
        })
        .eq('id', command.jobId);

      return `Put job ${command.jobId} on hold`;

    case 'assign_tech': {
      const { data: techData, error: techError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', `%${command.techName}%`)
        .maybeSingle();

      if (techError || !techData) {
        return `Technician ${command.techName} not found.`;
      }

      await supabase
        .from('work_order_lines')
        .update({
          assigned_tech_id: techData.id,
        })
        .eq('id', command.jobId);

      return `Assigned technician ${command.techName} to job ${command.jobId}`;
    }

    case 'update_complaint':
      await supabase
        .from('work_order_lines')
        .update({
          complaint: command.complaint ?? null,
        })
        .eq('id', command.jobId);

      return `Updated complaint for job ${command.jobId}`;

    default:
      return 'Command not recognized.';
  }
}