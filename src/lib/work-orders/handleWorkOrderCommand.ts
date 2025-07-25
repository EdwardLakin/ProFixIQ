import { createServerClient } from '@lib/supabaseServerClient'
import type { Database } from '../../types/supabase'

export async function handleWorkOrderCommand(command: any, line: { id: string; work_order_id: string | null; vehicle_id: string | null; complaint: string | null; cause: string | null; correction: string | null; status: "ready" | "active" | "paused" | "on_hold" | "completed" | "queued" | "awaiting" | "in_progress"; assigned_to: string | null; labor_time?: number | null; parts_needed?: string[] | null; parts_received?: string[] | null; created_at: string; updated_at: string; punched_in_at: string | null; punched_out_at: string | null; hold_reason: string | null; assigned_tech_id: string | null }, setLine: unknown): Promise<string> {
  const supabase = createServerClient()

  switch (command.type) {
    case 'start_job': {
      const updates: Partial<Database['public']['Tables']['work_order_lines']['Update']> = {
        status: 'in_progress',
        punched_in_at: new Date().toISOString(),
      }

      await supabase
  .from('work_order_lines')
  .update({
    status: 'completed',
    punched_out_at: new Date().toISOString(),
  } as Database['public']['Tables']['work_order_lines']['Update'])
  .eq('id', command.jobId)

      return `Started job ${command.jobId}`
    }

    case 'complete_job': {
      const updates: Partial<Database['public']['Tables']['work_order_lines']['Update']> = {
        status: 'completed',
        punched_out_at: new Date().toISOString(),
      }

      await supabase
  .from('work_order_lines')
  .update({
    status: 'completed',
    punched_out_at: new Date().toISOString(),
  } as Database['public']['Tables']['work_order_lines']['Update'])
  .eq('id', command.jobId)

      return `Completed job ${command.jobId}`
    }

    case 'put_on_hold': {
      const updates: Partial<Database['public']['Tables']['work_order_lines']['Update']> = {
        status: 'on_hold',
        hold_reason: command.reason ?? '',
      }

      await supabase
  .from('work_order_lines')
  .update({
    status: 'completed',
    punched_out_at: new Date().toISOString(),
  } as Database['public']['Tables']['work_order_lines']['Update'])
  .eq('id', command.jobId)

      return `Put job ${command.jobId} on hold`
    }

    case 'assign_tech': {
      const { data: techData, error: techError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', `%${command.techName}%`)
        .maybeSingle()

      if (techError || !techData) {
        return `Technician ${command.techName} not found.`
      }

      const updates: Partial<Database['public']['Tables']['work_order_lines']['Update']> = {
        assigned_tech_id: techData.id,
      }

      await supabase
  .from('work_order_lines')
  .update({
    status: 'completed',
    punched_out_at: new Date().toISOString(),
  } as Database['public']['Tables']['work_order_lines']['Update'])
  .eq('id', command.jobId)

      return `Assigned technician ${command.techName} to job ${command.jobId}`
    }

    case 'update_complaint': {
      const updates: Partial<Database['public']['Tables']['work_order_lines']['Update']> = {
        complaint: command.complaint ?? null,
      }

      await supabase
  .from('work_order_lines')
  .update({
    status: 'completed',
    punched_out_at: new Date().toISOString(),
  } as Database['public']['Tables']['work_order_lines']['Update'])
  .eq('id', command.jobId)

      return `Updated complaint for job ${command.jobId}`
    }

    default:
      return 'Command not recognized.'
  }
}