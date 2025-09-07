// features/work-orders/lib/updateLineStatusIfPartsReceived.ts
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type WOLRow = Database["public"]["Tables"]["work_order_lines"]["Row"];
type WOLUpdate = Database["public"]["Tables"]["work_order_lines"]["Update"];

export async function updateLineStatusIfPartsReceived(lineId: string) {
  const supabase = await createServerSupabaseRSC();

  const { data: line } = await supabase
    .from("work_order_lines")
    .select("id, parts_required, parts_received, status, hold_reason")
    .eq("id", lineId)
    .single<WOLRow>();

  if (!line) return;

  const required = Array.isArray(line.parts_required) ? (line.parts_required as string[]) : [];
  const received = Array.isArray(line.parts_received) ? (line.parts_received as string[]) : [];

  const allReceived = required.length > 0 && required.every((p) => received.includes(p));

  if (allReceived && line.status === "on_hold") {
    const update: WOLUpdate = { status: "awaiting", hold_reason: null };
    await supabase.from("work_order_lines").update(update).eq("id", lineId);
  }
}