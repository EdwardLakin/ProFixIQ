import { getServerSupabase } from "./supabase";

export async function appendEvent(runId: string, step: number, kind: string, content: unknown) {
  const supabase = getServerSupabase();
  await supabase.from("agent_events").insert({ run_id: runId, step, kind, content });
}
