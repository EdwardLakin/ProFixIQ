import "server-only";

import type { Database } from "@shared/types/types/supabase";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export type AgentRequestRow = Database["public"]["Tables"]["agent_requests"]["Row"];
type AdminClient = ReturnType<typeof createAdminSupabase>;

const PAGE_SIZE = 1000;

/** Reads the complete feedback ledger in pages instead of truncating history. */
export async function fetchAllLedgerRows(
  admin: AdminClient,
): Promise<{ rows: AgentRequestRow[]; error: string | null }> {
  const rows: AgentRequestRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("agent_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    const page = (data ?? []) as AgentRequestRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

/** Reads every submission in one feedback cluster (canonical row included). */
export async function fetchClusterRows(
  admin: AdminClient,
  clusterId: string,
): Promise<{ rows: AgentRequestRow[]; error: string | null }> {
  const rows: AgentRequestRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("agent_requests")
      .select("*")
      .or(`id.eq.${clusterId},normalized_json->feedback->>clusterId.eq.${clusterId}`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    const page = (data ?? []) as AgentRequestRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}
