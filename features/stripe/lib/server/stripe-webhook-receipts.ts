import type Stripe from "stripe";

import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminSupabase>;

export type StripeWebhookClaim = {
  claimed: boolean;
  alreadyProcessed: boolean;
  inProgress: boolean;
  claimToken: string | null;
  attemptCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eventObjectId(event: Stripe.Event): string | null {
  const object = event.data.object as { id?: unknown };
  return typeof object.id === "string" && object.id.trim()
    ? object.id.trim()
    : null;
}

function eventCreatedAt(event: Stripe.Event): string {
  return new Date(event.created * 1000).toISOString();
}

export async function claimStripeWebhookEvent(args: {
  supabase: AdminClient;
  event: Stripe.Event;
}): Promise<StripeWebhookClaim> {
  const { data, error } = await args.supabase.rpc(
    "claim_stripe_webhook_event",
    {
      p_event_id: args.event.id,
      p_event_type: args.event.type,
      p_livemode: args.event.livemode,
      p_stripe_account_id: args.event.account ?? "",
      p_object_id: eventObjectId(args.event) ?? "",
      p_event_created_at: eventCreatedAt(args.event),
      p_lease_seconds: 300,
    },
  );

  if (error) {
    throw new Error(`Stripe webhook claim failed (${error.code ?? "unknown"})`);
  }

  const row: unknown = Array.isArray(data) ? data[0] : null;
  if (!isRecord(row)) {
    throw new Error("Stripe webhook claim returned no receipt");
  }

  const claimed = row.claimed;
  const alreadyProcessed = row.already_processed;
  const inProgress = row.in_progress;
  const claimToken =
    typeof row.claim_token === "string" ? row.claim_token : null;
  const attemptCount = row.attempt_count;
  const dispositionCount = [claimed, alreadyProcessed, inProgress].filter(
    (value) => value === true,
  ).length;

  if (
    typeof claimed !== "boolean" ||
    typeof alreadyProcessed !== "boolean" ||
    typeof inProgress !== "boolean" ||
    typeof attemptCount !== "number" ||
    !Number.isInteger(attemptCount) ||
    attemptCount < 1 ||
    dispositionCount !== 1 ||
    (claimed && !claimToken) ||
    (!claimed && claimToken !== null)
  ) {
    throw new Error("Stripe webhook claim returned an invalid receipt");
  }

  return {
    claimed,
    alreadyProcessed,
    inProgress,
    claimToken,
    attemptCount,
  };
}

export async function completeStripeWebhookEvent(args: {
  supabase: AdminClient;
  eventId: string;
  claimToken: string;
}): Promise<void> {
  const { data, error } = await args.supabase.rpc(
    "complete_stripe_webhook_event",
    {
      p_event_id: args.eventId,
      p_claim_token: args.claimToken,
    },
  );

  if (error || data !== true) {
    throw new Error(
      `Stripe webhook completion failed (${error?.code ?? "claim_mismatch"})`,
    );
  }
}

export async function failStripeWebhookEvent(args: {
  supabase: AdminClient;
  eventId: string;
  claimToken: string;
  error: unknown;
}): Promise<void> {
  const detail =
    args.error instanceof Error
      ? `${args.error.name}: ${args.error.message}`
      : `Unknown failure: ${String(args.error)}`;
  const { error } = await args.supabase.rpc("fail_stripe_webhook_event", {
    p_event_id: args.eventId,
    p_claim_token: args.claimToken,
    p_error: detail.slice(0, 1000),
  });

  if (error) {
    throw new Error(
      `Stripe webhook failure receipt failed (${error.code ?? "unknown"})`,
    );
  }
}
