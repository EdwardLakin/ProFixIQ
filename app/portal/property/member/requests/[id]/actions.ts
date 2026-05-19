"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Tables: {
  property_maintenance_requests: { Row: { id: string; shop_id: string } };
  property_request_events: { Insert: { request_id: string; shop_id: string; actor_profile_id: string | null; actor_type: string; event_type: string; visibility: string; body: string; metadata: Record<string, unknown> } };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

const readRequired = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function addTenantVisibleComment(formData: FormData) {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const requestId = readRequired(formData, "request_id");
  const body = readRequired(formData, "body");

  if (!requestId || !body) {
    redirect(`/portal/property/member/requests/${requestId ?? ""}?error=${encodeURIComponent("Comment body is required.")}`);
  }

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id").eq("id", requestId).maybeSingle();

  if (!requestRow) {
    redirect(`/portal/property/member/requests/${requestId}?error=${encodeURIComponent("Request is not visible to this account.")}`);
  }

  const { error } = await supabase.from("property_request_events").insert({
    request_id: requestId,
    shop_id: requestRow.shop_id,
    actor_profile_id: user.id,
    actor_type: "tenant",
    event_type: "comment",
    visibility: "tenant_visible",
    body,
    metadata: {},
  });

  if (error) {
    redirect(`/portal/property/member/requests/${requestId}?error=${encodeURIComponent(`Unable to add comment: ${error.message}`)}`);
  }

  redirect(`/portal/property/member/requests/${requestId}?status=${encodeURIComponent("comment-added")}`);
}
