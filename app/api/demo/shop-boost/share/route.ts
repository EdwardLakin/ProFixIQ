import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  buildShopBoostShareHref,
  verifyShopBoostPreviewToken,
} from "@/features/integrations/shopBoost/shareAccess";
import { loadShadowPreviewContext } from "@/features/integrations/shopBoost/shadowShop";
import {
  consumeRateLimit,
  enforcePublicRouteRateLimit,
  tooManyRequestsResponse,
} from "@/features/shared/lib/server/publicRouteRateLimit";

const MAX_EMAILS_PER_RECIPIENT = 3;
const MAX_SHARES_PER_DEMO_PER_HOUR = 10;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  const limited = enforcePublicRouteRateLimit({
    request: req,
    route: "demo-shop-boost-share",
    max: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  try {
    const body = (await req.json()) as {
      previewToken?: string;
      recipientEmail?: string;
      senderName?: string;
    };

    const access = verifyShopBoostPreviewToken(body.previewToken?.trim() ?? "");
    const recipientEmail = body.recipientEmail?.trim() ?? "";
    const senderName =
      body.senderName?.trim().slice(0, 80) || "ProFixIQ Shop Boost";

    if (!access) {
      return NextResponse.json(
        { ok: false, error: "Analysis unavailable." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!isEmail(recipientEmail)) {
      return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
    }

    const context = await loadShadowPreviewContext({
      demoId: access.demoId,
      intakeId: access.intakeId,
    });
    if (!context) {
      return NextResponse.json(
        { ok: false, error: "Analysis unavailable." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const origin = new URL(req.url).origin;
    const shareLink = buildShopBoostShareHref({
      origin,
      demoId: access.demoId,
      intakeId: access.intakeId,
      senderName,
      expiresInDays: 7,
    });

    // Caps keep this unauthenticated endpoint from being used as an email relay.
    const demoLimit = consumeRateLimit({
      key: `demo-shop-boost-share:${access.demoId}`,
      max: MAX_SHARES_PER_DEMO_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (!demoLimit.allowed) return tooManyRequestsResponse(demoLimit.retryAfterSeconds);

    const supabase = createAdminSupabase();
    const { data: existingLead, error: leadLookupError } = await supabase
      .from("demo_shop_boost_leads")
      .select("id, share_count, emails_sent, lead_kind")
      .eq("demo_id", access.demoId)
      .eq("email", recipientEmail)
      .maybeSingle<{ id: string; share_count: number | null; emails_sent: number | null; lead_kind: string | null }>();

    // Fail closed: a lookup error (including duplicate rows for one recipient)
    // must not fall through to "new recipient" and bypass the cap.
    if (leadLookupError) {
      console.error("[demo/shop-boost/share] Recipient lookup failed", leadLookupError);
      return NextResponse.json(
        { ok: false, error: "Unable to share this analysis right now." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    if ((existingLead?.emails_sent ?? 0) >= MAX_EMAILS_PER_RECIPIENT) {
      return NextResponse.json(
        { ok: false, error: "This analysis has already been shared with that recipient." },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Read configuration before reserving so a misconfiguration does not use a slot.
    const sendgridApiKey = requiredEnv("SENDGRID_API_KEY");
    const fromEmail = requiredEnv("SENDGRID_FROM_EMAIL");

    // Reserve the send before calling SendGrid so concurrent requests cannot all
    // pass the cap on a stale read. For an existing recipient the reservation is
    // a conditional update (only one request can move emails_sent from N to N+1);
    // a new recipient's row is written first, with a known id so it can be
    // released if the send fails.
    const sentBefore = existingLead?.emails_sent ?? 0;
    const newLeadId = randomUUID();
    if (existingLead?.id) {
      const { data: reserved, error: reserveError } = await supabase
        .from("demo_shop_boost_leads")
        .update({
          share_count: (existingLead.share_count ?? 0) + 1,
          emails_sent: sentBefore + 1,
          last_viewed_at: new Date().toISOString(),
          engagement_score: Math.min(100, (sentBefore + 1) * 8),
          lead_kind: existingLead.lead_kind === "activation_claim" ? "activation_claim" : "share_recipient",
        } as Record<string, unknown>)
        .eq("id", existingLead.id)
        .eq("emails_sent", sentBefore)
        .select("id");

      if (reserveError) throw new Error(reserveError.message);
      if (!reserved || reserved.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Another share for this recipient is in progress. Please retry." },
          { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "5" } },
        );
      }
    } else {
      const { error: insertError } = await supabase.from("demo_shop_boost_leads").insert({
        id: newLeadId,
        demo_id: access.demoId,
        email: recipientEmail,
        summary: `Shared by ${senderName}`,
        share_count: 1,
        emails_sent: 1,
        engagement_score: 8,
        lead_kind: "share_recipient",
      } as Record<string, unknown>);
      if (insertError) throw new Error(insertError.message);
    }

    try {
      sgMail.setApiKey(sendgridApiKey);
      await sgMail.send({
        to: recipientEmail,
        from: fromEmail,
        // The subject is fixed apart from the shop name: the sender name is
        // free text from an unauthenticated caller, so it only appears in the
        // body, labelled as entered by the sender.
        subject: `A Shop Boost analysis was shared with you for ${context.shopName}`,
        text: [
          `This analysis was generated for ${context.shopName}.`,
          `Shared by (name entered by the sender): ${senderName}`,
          `ROI highlights and blockers are included in this read-only view.`,
          `Open analysis: ${shareLink}`,
        ].join("\n"),
      });
    } catch (sendError) {
      // Best-effort release of the reserved slot; a failed release only costs
      // the recipient one slot, which errs on the safe side.
      try {
        if (existingLead?.id) {
          await supabase
            .from("demo_shop_boost_leads")
            .update({
              share_count: existingLead.share_count ?? 0,
              emails_sent: sentBefore,
            } as Record<string, unknown>)
            .eq("id", existingLead.id)
            .eq("emails_sent", sentBefore + 1);
        } else {
          await supabase.from("demo_shop_boost_leads").delete().eq("id", newLeadId);
        }
      } catch (releaseError) {
        console.error("[demo/shop-boost/share] Unable to release reserved share slot", releaseError);
      }
      throw sendError;
    }

    return NextResponse.json(
      { ok: true, shareLink },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[demo/shop-boost/share] Unable to share analysis", error);
    return NextResponse.json(
      { ok: false, error: "Unable to send share email." },
      { status: 500 },
    );
  }
}
