// app/work-orders/[id]/quote-review/page.tsx
// Split view: left shows WorkOrderIdClient, right shows Quote Review in a panel.
// IMPORTANT: params.id may be a custom_id (e.g. "T0000007") OR a UUID.
// We resolve to the real work_orders.id UUID before embedding quote review.

import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { redirect } from "next/navigation";




function looksLikeUuid(s: string): boolean {
  return s.includes("-") && s.length >= 36;
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await props.params;

  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/sign-in?redirect=${encodeURIComponent(
        `/work-orders/${routeId}/quote-review`,
      )}`,
    );
  }

  // Resolve routeId -> real UUID + custom_id
  let resolved: { id: string; custom_id: string | null } | null = null;

  if (looksLikeUuid(routeId)) {
    const { data } = await supabase
      .from("work_orders")
      .select("id, custom_id")
      .eq("id", routeId)
      .maybeSingle();

    if (data) resolved = data;
  }

  if (!resolved) {
    // Try exact match on custom_id
    const { data } = await supabase
      .from("work_orders")
      .select("id, custom_id")
      .eq("custom_id", routeId)
      .maybeSingle();

    if (data) resolved = data;
  }

  if (!resolved) {
    // Try case-insensitive match on custom_id
    const { data } = await supabase
      .from("work_orders")
      .select("id, custom_id")
      .ilike("custom_id", routeId)
      .maybeSingle();

    if (data) resolved = data;
  }

  if (!resolved) {
    return (
      <div className="p-6 text-sm text-red-300">
        Work order not found for <span className="font-mono">{routeId}</span>
      </div>
    );
  }

  const woUuid = resolved.id;
  redirect(`/quote-review/${woUuid}`);
}