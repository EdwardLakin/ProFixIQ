import { createClient } from "@supabase/supabase-js";
import type { InspectionSession } from "@inspections/lib/inspection/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function saveInspectionSession(session: InspectionSession) {
  const payload = {
    user_id: session.customerId || null,
    vehicle_id: session.vehicleId || null,
    quote_id: null,
    template_id: session.templateId || null,
    template_name: session.templateName || null,
    result: JSON.stringify(session.sections ?? []),
    quote: JSON.stringify(session.quote ?? []),
    status: session.status ?? "in_progress",
    transcript: session.transcript || "",
    work_order_id: session.workOrderId || null,
    // id: session.id || undefined, // uncomment if your table upserts on id
  };

  const { error } = await supabase
    .from("inspections")
    .upsert(payload, { ignoreDuplicates: false })
    .select()
    .single();

  if (error) {
    console.error("Failed to save inspection session:", error);
    throw error;
  }
}