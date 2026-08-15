import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Json } from "@/features/shared/types/types/supabase";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function sendCopilotServerCommand<T>(input: {
  authUserId: string;
  profileId: string;
  shopId: string;
  action:
    | "session.read"
    | "session.start"
    | "event.append"
    | "documentation.append";
  args: Record<string, unknown>;
}): Promise<T> {
  const admin = createAdminSupabase();
  const response = await admin
    .from("ai_action_events")
    .insert({
      shop_id: input.shopId,
      event_type: "technician_copilot_command",
      actor_id: input.profileId,
      actor_role: "mechanic",
      source: "technician_copilot_command",
      payload: {
        authUserId: input.authUserId,
        action: input.action,
        ...input.args,
      } as Json,
      metadata: {} as Json,
    })
    .select("id,metadata")
    .single();

  if (response.error) throw new Error(response.error.message);

  const metadata = asObject(response.data.metadata);
  const commandError = asObject(metadata.copilotCommandError);
  const result = metadata.copilotCommandResult as T;

  if (commandError.message) throw new Error(String(commandError.message));
  if (result == null) {
    throw new Error("Technician CoPilot command returned no result.");
  }
  return result;
}
