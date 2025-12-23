import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function initialsFromName(input: string | null | undefined): string {
  const s = (input ?? "").trim();
  if (!s) return "XX";
  const parts = s.split(/\s+/).filter(Boolean);

  const first = (parts[0]?.[0] ?? "X").toUpperCase();
  const last =
    (parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]) ?? "X";

  return `${first}${String(last).toUpperCase()}`;
}

async function loadStaffInitials(
  supabase: SupabaseClient<DB>,
  userId: string,
): Promise<string> {
  // Try profiles.user_id first (common pattern)
  const byUserId = await supabase
    .from("profiles")
    .select("full_name, first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();

  const row =
    byUserId.data ??
    // Fallback: some schemas use profiles.id == auth.uid()
    (
      await supabase
        .from("profiles")
        .select("full_name, first_name, last_name")
        .eq("id", userId)
        .maybeSingle()
    ).data ??
    null;

  const full =
    (row as any)?.full_name ??
    [row?.first_name, row?.last_name].filter(Boolean).join(" ") ??
    null;

  return initialsFromName(full);
}

/**
 * Generates a human-friendly work order number:
 *   <STAFF_INITIALS><6-digit shop-wide sequence>
 *
 * Example:
 *   EL000231
 *
 * Notes:
 * - Sequence is shop-wide (shop_id filtered).
 * - Initials are just “context”; the number is the true ordering.
 */
export async function generateWorkOrderCustomId(
  supabase: SupabaseClient<DB>,
  args: {
    shopId: string;
    createdByUserId: string;
  },
): Promise<string> {
  const { shopId, createdByUserId } = args;

  const prefix = await loadStaffInitials(supabase, createdByUserId);

  // Find highest existing sequence number for this shop, regardless of initials.
  // We parse the trailing digits of custom_id (e.g., EL000231 -> 231).
  const { data: rows, error } = await supabase
    .from("work_orders")
    .select("custom_id")
    .eq("shop_id", shopId)
    .not("custom_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(250); // enough to find a high number even if some have weird formats

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[generateWorkOrderCustomId] load work_orders failed:", error);
  }

  let max = 0;

  for (const r of rows ?? []) {
    const id = String((r as any).custom_id ?? "");
    const m = id.match(/(\d+)$/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }

  const nextNumber = max + 1;
  const numberPart = String(nextNumber).padStart(6, "0");
  return `${prefix}${numberPart}`;
}