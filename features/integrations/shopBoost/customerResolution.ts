import type { Database } from "@shared/types/types/supabase";
import { createHash } from "crypto";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;
type AdminClient = ReturnType<typeof createAdminSupabase>;

export type CustomerResolutionType =
  | "matched_existing_by_external_id"
  | "matched_existing_by_email"
  | "matched_existing_by_phone"
  | "merge_candidate_requires_confirmation"
  | "updated_existing_customer"
  | "created_new_customer"
  | "blocked_duplicate_conflict"
  | "unresolved";

export type DeterministicCustomerMatch = {
  resolutionType:
    | "matched_existing_by_external_id"
    | "matched_existing_by_email"
    | "matched_existing_by_phone";
  customerId: string;
};

export function normalizeCustomerEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeCustomerPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

export function sourceExternalId(domain: "customer" | "vehicle" | "work_order", sourceId: string): string {
  return `import:source:${domain}:${sha1(sourceId).slice(0, 20)}`;
}

export function sourceCustomerKey(sourceCustomerId: string | null | undefined): string | null {
  const normalized = String(sourceCustomerId ?? "").trim();
  if (!normalized) return null;
  return sha1(normalized).slice(0, 20);
}

async function lookupCustomerIdByPhone(args: {
  supabase: AdminClient;
  shopId: string;
  phone: string;
}): Promise<string | null> {
  const { data } = await args.supabase
    .from("customers")
    .select("id,phone,phone_number")
    .eq("shop_id", args.shopId)
    .limit(3000);

  const matched = ((data ?? []) as Array<Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "phone" | "phone_number">>).find(
    (row) => normalizeCustomerPhone(row.phone ?? row.phone_number) === args.phone,
  );
  return matched?.id ? String(matched.id) : null;
}

export async function findDeterministicCustomerMatch(args: {
  supabase: AdminClient;
  shopId: string;
  sourceCustomerId?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<DeterministicCustomerMatch | null> {
  const sourceCustomerId = String(args.sourceCustomerId ?? "").trim();
  if (sourceCustomerId) {
    const { data } = await args.supabase
      .from("customers")
      .select("id")
      .eq("shop_id", args.shopId)
      .eq("external_id", sourceExternalId("customer", sourceCustomerId))
      .maybeSingle();
    if (data?.id) {
      return { resolutionType: "matched_existing_by_external_id", customerId: String(data.id) };
    }
  }

  const email = normalizeCustomerEmail(args.email);
  if (email) {
    const { data } = await args.supabase
      .from("customers")
      .select("id")
      .eq("shop_id", args.shopId)
      .eq("email", email)
      .maybeSingle();
    if (data?.id) {
      return { resolutionType: "matched_existing_by_email", customerId: String(data.id) };
    }
  }

  const phone = normalizeCustomerPhone(args.phone);
  if (phone) {
    const id = await lookupCustomerIdByPhone({ supabase: args.supabase, shopId: args.shopId, phone });
    if (id) {
      return { resolutionType: "matched_existing_by_phone", customerId: id };
    }
  }

  return null;
}

export function decideCustomerResolution(args: {
  context: "import" | "review";
  resolutionAction: "linked_to_existing" | "created_new";
  deterministicMatch: DeterministicCustomerMatch | null;
  explicitCandidateId?: string | null;
}): {
  resolutionType: CustomerResolutionType;
  matchedRecordId: string | null;
  blockingReason: string | null;
} {
  if (args.deterministicMatch?.customerId) {
    if (args.context === "review" && args.resolutionAction === "created_new") {
      return {
        resolutionType: "blocked_duplicate_conflict",
        matchedRecordId: args.deterministicMatch.customerId,
        blockingReason: "deterministic_duplicate_exists",
      };
    }
    return {
      resolutionType: args.deterministicMatch.resolutionType,
      matchedRecordId: args.deterministicMatch.customerId,
      blockingReason: null,
    };
  }

  const explicitCandidateId = String(args.explicitCandidateId ?? "").trim();
  if (explicitCandidateId) {
    if (args.resolutionAction === "linked_to_existing" || args.context === "import") {
      return { resolutionType: "updated_existing_customer", matchedRecordId: explicitCandidateId, blockingReason: null };
    }
    return {
      resolutionType: "blocked_duplicate_conflict",
      matchedRecordId: explicitCandidateId,
      blockingReason: "merge_candidate_selected",
    };
  }

  if (args.resolutionAction === "linked_to_existing") {
    return {
      resolutionType: "merge_candidate_requires_confirmation",
      matchedRecordId: null,
      blockingReason: "no_deterministic_customer_match",
    };
  }

  return { resolutionType: "created_new_customer", matchedRecordId: null, blockingReason: null };
}
