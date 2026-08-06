import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/features/shared/types/types/supabase";

type PortalNotificationInput = {
  userId: string;
  customerId: string | null;
  workOrderId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  kind: string;
  title: string;
  body?: string | null;
  eventKey: string;
  href?: string | null;
  metadata?: Record<string, Json | undefined>;
};

export async function upsertPortalNotification(
  supabase: SupabaseClient<Database>,
  input: PortalNotificationInput,
): Promise<void> {
  const metadata: Record<string, Json> = {};
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (value !== undefined) metadata[key] = value;
  }
  if (input.href) metadata.href = input.href;
  const { error } = await supabase.from("portal_notifications").upsert(
    {
      user_id: input.userId,
      customer_id: input.customerId,
      work_order_id: input.workOrderId ?? null,
      conversation_id: input.conversationId ?? null,
      message_id: input.messageId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      event_key: input.eventKey,
      metadata,
    },
    { onConflict: "user_id,event_key" },
  );

  if (error) throw new Error(error.message);
}
