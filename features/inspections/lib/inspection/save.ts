// lib/inspection/save.ts
import { createClient } from "@supabase/supabase-js";
import { InspectionSession } from "@shared/lib/inspection/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function saveInspectionSession(session: InspectionSession) {
  const payload = {
    user_id: session.customerId || "", // Replace with real user logic if available
    vehicle_id: session.vehicleId,
    quote_id: null, // or session.quoteId if managed
    template_id: session.templateId,
    template_name: session.templateName,
    result: JSON.stringify(session.sections),
    quote: JSON.stringify(session.quote),
    status: session.status,
    transcript: session.transcript || "",
    work_order_id: session.workOrderId || null,
  };

  const { error } = await supabase.from("inspections").upsert(payload);

  if (error) {
    console.error("Failed to save inspection session:", error.message);
    throw new Error(error.message);
  }
}
