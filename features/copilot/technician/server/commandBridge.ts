import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Json } from "@/features/shared/types/types/supabase";

export class TechnicianCopilotCommandError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function runTechnicianCopilotCommand<T>(input: {
  authUserId: string;
  action: "session.read" | "session.start" | "event.append";
  payload: Record<string, unknown>;
}): Promise<T> {
  const admin = createAdminSupabase();
  const response = await admin
    .from("copilot_server_commands")
    .insert({
      auth_user_id: input.authUserId,
      action: input.action,
      payload: input.payload as Json,
    })
    .select("result,error_code,error_message")
    .single();

  if (response.error) {
    throw new TechnicianCopilotCommandError(
      "copilot_command_transport_failed",
      response.error.message,
    );
  }
  if (response.data.error_code) {
    throw new TechnicianCopilotCommandError(
      response.data.error_code,
      response.data.error_message ?? "Technician CoPilot command failed.",
    );
  }
  if (response.data.result == null) {
    throw new TechnicianCopilotCommandError(
      "copilot_command_missing_result",
      "Technician CoPilot command returned no result.",
    );
  }

  return response.data.result as T;
}
