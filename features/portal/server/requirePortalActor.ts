import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  requireAuthedUser,
  requirePortalCustomerAccess,
  type PortalCustomer,
  type PortalInviteEvidence,
} from "@/features/portal/server/portalAuth";

export type DB = Database;

export type PortalActor = {
  userId: string;
  customer: PortalCustomer;
  inviteEvidence: PortalInviteEvidence;
};

export async function requirePortalCustomerActor(
  supabase: SupabaseClient<DB>,
): Promise<PortalActor> {
  const user = await requireAuthedUser(supabase);
  const access = await requirePortalCustomerAccess(supabase, user.id, user.email);
  return {
    userId: access.user.id,
    customer: access.customer,
    inviteEvidence: access.inviteEvidence,
  };
}
