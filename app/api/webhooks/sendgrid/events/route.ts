import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  normalizeSendGridEvent,
  parseSendGridEvents,
  shouldSuppressEmail,
  verifySendGridWebhookSignature,
} from "@/features/email/server/sendgridWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value.replaceAll("\\n", "\n");
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-twilio-email-event-webhook-timestamp") ?? "";
  const signature = req.headers.get("x-twilio-email-event-webhook-signature") ?? "";

  if (!timestamp || !signature) {
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
  }

  if (!verifySendGridWebhookSignature({
    rawBody,
    timestamp,
    signature,
    publicKey: requiredEnv("SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY"),
  })) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let events;
  try {
    events = parseSendGridEvents(rawBody).map(normalizeSendGridEvent);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook payload" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();
  const rpc = admin as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
  let processed = 0;

  for (const event of events) {
    if (!event.providerEventId) continue;

    const suppress = Boolean(event.email && shouldSuppressEmail(event.eventType));
    const { data: inserted, error: eventError } = await rpc.rpc(
      "process_sendgrid_delivery_event",
      {
        p_email_log_id: event.emailLogId,
        p_provider_event_id: event.providerEventId,
        p_provider_message_id: event.providerMessageId,
        p_event_type: event.eventType,
        p_event_at: event.eventAt,
        p_error_text: ["bounce", "dropped", "deferred"].includes(event.eventType)
          ? event.errorText
          : null,
        p_payload: event.safePayload,
        p_suppression_email: suppress ? event.email : null,
      },
    );
    if (eventError) throw new Error(eventError.message);
    if (inserted) processed += 1;
  }

  return NextResponse.json({ ok: true, processed });
}
