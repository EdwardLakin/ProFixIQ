import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;

type Params = {
  supabase: SupabaseClient<DB>;
  event: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: Json;
  at?: string;
};

/**
 * Best-effort activity logging that supports both known activity_logs shapes.
 * Never throws to avoid breaking critical user flows.
 */
export async function logOperationalEvent({
  supabase,
  event,
  actorId = null,
  entityType = null,
  entityId = null,
  details = null,
  at,
}: Params): Promise<void> {
  const timestamp = at ?? new Date().toISOString();
  const context =
    details && typeof details === "object"
      ? ({
          ...(details as Record<string, Json | undefined>),
          entity_type: entityType ?? undefined,
          entity_id: entityId ?? undefined,
        } as Json)
      : ({
          entity_type: entityType ?? undefined,
          entity_id: entityId ?? undefined,
          details,
        } as Json);

  const modernPayload = {
    event,
    actor_id: actorId,
    created_at: timestamp,
    details: context,
  };

  const legacyPayload: DB["public"]["Tables"]["activity_logs"]["Insert"] = {
    action: event,
    user_id: actorId,
    timestamp,
    target_table: entityType,
    target_id: entityId,
    context,
  };

  try {
    const { error } = await supabase.from("activity_logs").insert(modernPayload);
    if (!error) return;
  } catch {
    // try legacy payload below
  }

  try {
    await supabase.from("activity_logs").insert(legacyPayload);
  } catch {
    // swallow logging failures to preserve primary action flow
  }
}
