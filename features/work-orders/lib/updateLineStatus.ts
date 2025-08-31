// features/work-orders/lib/updateLineStatus.ts
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

export async function updateLineStatusIfPartsReceived(lineId: string) {
  const supabase = await createServerSupabaseRSC();

  const { data: line, error } = await supabase
    .from("work_order_lines")
    .select("id, parts_needed, parts_received, status, hold_reason")
    .eq("id", lineId)
    .single<WorkOrderLine>();

  if (error || !line) return;

  // Defensive parse: Supabase gives Json | null, so ensure arrays
  const required: string[] = Array.isArray(line.parts_required)
    ? (line.parts_required as string[])
    : [];

  const received: string[] = Array.isArray(line.parts_received)
    ? (line.parts_received as string[])
    : [];

  // Only "all received" if we actually required some parts
  const allReceived =
    required.length > 0 && required.every((p) => received.includes(p));

  if (allReceived && line.status === "on_hold") {
    await supabase
      .from("work_order_lines")
      .update({
        status: "awaiting",
        hold_reason: null as unknown as string, // ✅ force nullable type-safe
      })
      .eq("id", lineId);
  }
}