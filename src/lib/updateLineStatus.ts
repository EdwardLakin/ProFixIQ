// src/lib/updateLineStatus.ts

import supabase from '@lib/supabaseServer';

export async function updateLineStatusIfPartsReceived(lineId: string) {
  const { data: line, error } = await supabase
    .from('work_order_lines')
    .select('id, parts_required, parts_received, line_status')
    .eq('id', lineId)
    .single();

  if (error || !line) return;

  const required = line.parts_required || [];
  const received = line.parts_received || [];

  const allReceived = required.every((part: string) => received.includes(part));

  if (allReceived && line.line_status === 'on_hold_parts') {
    await supabase
      .from('work_order_lines')
      .update({ line_status: 'ready', on_hold_since: null })
      .eq('id', lineId);
  }
}