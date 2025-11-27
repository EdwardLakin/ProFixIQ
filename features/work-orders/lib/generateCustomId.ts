import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function generateWorkOrderCustomId(
  supabase: SupabaseClient<DB>,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;

  // 1) load customer for initials
  const { data: customer, error } = await supabase
    .from("customers")
    .select("first_name, last_name")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !customer) {
    // eslint-disable-next-line no-console
    console.error("[generateWorkOrderCustomId] customer load failed:", error);
    return null;
  }

  const firstInitial =
    (customer.first_name?.trim()[0] ?? "X").toUpperCase();
  const lastInitial =
    (customer.last_name?.trim()[0] ?? "X").toUpperCase();
  const prefix = `${firstInitial}${lastInitial}`;

  // 2) find the highest existing number for this prefix
  const { data: rows, error: werr } = await supabase
    .from("work_orders")
    .select("custom_id")
    .ilike("custom_id", `${prefix}%`)
    .order("custom_id", { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (!werr && rows && rows.length > 0) {
    const last = rows[0]?.custom_id ?? "";
    const m = last.match(/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) nextNumber = n + 1;
    }
  }

  const numberPart = String(nextNumber).padStart(6, "0"); // -> 000001
  return `${prefix}${numberPart}`; // e.g. TU000001
}