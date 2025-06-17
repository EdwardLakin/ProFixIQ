import { createServerClient } from '@supabase/ssr';

export async function getNextAvailableLine(technicianId: string) {
  const supabase = createServerClient();

  // Step 1: Check old work orders with ready lines
  const { data: resumeLines } = await supabase
    .from('work_order_lines')
    .select('id, work_order_id, priority, created_at')
    .eq('assigned_to', technicianId)
    .eq('line_status', 'ready')
    .order('created_at', { ascending: true });

  if (resumeLines && resumeLines.length > 0) {
    return resumeLines[0]; // Prioritize old job lines first
  }

  // Step 2: Get next job from queue (new assignments)
  const { data: queuedLines } = await supabase
    .from('work_order_lines')
    .select('id, work_order_id, priority, created_at')
    .is('assigned_to', null)
    .eq('line_status', 'ready')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (queuedLines && queuedLines.length > 0) {
    // Assign line to tech
    const line = queuedLines[0];
    await supabase
      .from('work_order_lines')
      .update({ assigned_to: technicianId })
      .eq('id', line.id);
    return line;
  }

  return null;
}