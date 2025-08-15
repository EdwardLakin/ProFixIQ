// features/work-orders/lib/updateLineStatus.ts
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

export async function updateLineStatusIfPartsReceived(lineId: string) {
  const supabase = await createServerSupabaseRSC();

  const { data: line, error } = await supabase
    .from("work_order_lines")
    .select("id, parts_needed, parts_received, status, hold_reason")
    .eq("id", lineId)
    .single();

  if (error || !line) return;

  const required: string[] = Array.isArray(line.parts_needed) ? line.parts_needed : [];
  const received: string[] = Array.isArray(line.parts_received) ? line.parts_received : [];

  // Only consider it "all received" if we actually required some parts
  const allReceived = required.length > 0 && required.every((p) => received.includes(p));

  if (allReceived && line.status === "on_hold") {
    await supabase
      .from("work_order_lines")
      .update({ status: "awaiting", hold_reason: null })
      .eq("id", lineId);
  }
}