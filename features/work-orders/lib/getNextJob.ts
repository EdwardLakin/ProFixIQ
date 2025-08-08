// features/work-orders/lib/getNextJob.ts
import { createServerSupabaseRSC } from '@shared/lib/supabase/server';

export async function getNextAvailableLine(technicianId: string) {
  const supabase = createServerSupabaseRSC();

  // Step 1: check for jobs the tech can resume
  const { data: resumeLines } = await supabase
    .from('work_order_lines')
    .select('id, work_order_id, priority, created_at')
    .eq('assigned_to', technicianId)
    .eq('line_status', 'ready')
    .order('created_at', { ascending: true });

  if (resumeLines?.length) return resumeLines[0];

  // Step 2: pick unassigned jobs
  const { data: queuedLines } = await supabase
    .from('work_order_lines')
    .select('id, work_order_id, priority, created_at')
    .is('assigned_to', null)
    .eq('line_status', 'ready')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (queuedLines?.length) {
    const line = queuedLines[0];
    await supabase
      .from('work_order_lines')
      .update({ assigned_to: technicianId })
      .eq('id', line.id);
    return line;
  }

  return null;
}