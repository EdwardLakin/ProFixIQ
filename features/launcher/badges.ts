// features/launcher/badges.ts
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Badge = number | "dot" | 0;

export async function badgeWorkOrders(userId: string): Promise<Badge> {
  const supabase = createClientComponentClient<DB>();

  // last read (feature-level)
  const { data: fr } = await supabase
    .from("feature_reads")
    .select("last_read_at")
    .eq("user_id", userId)
    .eq("feature_slug", "work-orders")
    .single();

  const since = fr?.last_read_at ?? "1970-01-01";

  // count open + updated since last read, scoped to me in any relevant role
  const { count } = await supabase
    .from("work_orders")
    .select("*", { head: true, count: "exact" })
    .eq("status", "open")
    .or(`assignee_id.eq.${userId}, reviewer_id.eq.${userId}`)
    .gt("updated_at", since);

  return count && count > 0 ? count : 0;
}