import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireAuthedUser, requirePortalCustomer, type PortalCustomer } from "@/features/portal/server/portalAuth";

export type DB = Database;

export type PortalActor = {
  userId: string;
  customer: PortalCustomer;
};

/**
 * Portal customer routes must always resolve ownership from auth user -> customer row.
 * No staff fallback logic is allowed in this helper.
 */
export async function requirePortalCustomerActor(
  supabase: SupabaseClient<DB>,
): Promise<PortalActor> {
  const { id: userId } = await requireAuthedUser(supabase);
  const customer = await requirePortalCustomer(supabase, userId);
  return { userId, customer };
}
