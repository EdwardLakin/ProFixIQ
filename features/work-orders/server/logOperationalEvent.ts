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
  throwOnFailure?: boolean;
};

function failureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return String(error || "unknown error");
}

/**
 * Best-effort activity logging that supports both known activity_logs shapes.
 * It remains non-blocking by default; strict callers can request an exception
 * so their durable action result records an explicit follow-up warning.
 */
export async function logOperationalEvent({
  supabase,
  event,
  actorId = null,
  entityType = null,
  entityId = null,
  details = null,
  at,
  throwOnFailure = false,
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

  let modernFailure: unknown = null;
  try {
    const { error } = await supabase
      .from("activity_logs")
      .insert(modernPayload);
    if (!error) return;
    modernFailure = error;
  } catch (error) {
    modernFailure = error;
  }

  let legacyFailure: unknown = null;
  try {
    const { error } = await supabase
      .from("activity_logs")
      .insert(legacyPayload);
    if (!error) return;
    legacyFailure = error;
  } catch (error) {
    legacyFailure = error;
  }

  if (throwOnFailure) {
    throw new Error(
      `Operational event logging failed for both activity_logs schemas: modern (${failureMessage(
        modernFailure,
      )}); legacy (${failureMessage(legacyFailure)}).`,
    );
  }
}
