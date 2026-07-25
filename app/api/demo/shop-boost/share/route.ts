import { NextRequest, NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  buildShopBoostShareHref,
  verifyShopBoostPreviewToken,
} from "@/features/integrations/shopBoost/shareAccess";
import { loadShadowPreviewContext } from "@/features/integrations/shopBoost/shadowShop";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
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

    sgMail.setApiKey(requiredEnv("SENDGRID_API_KEY"));
    await sgMail.send({
      to: recipientEmail,
      from: requiredEnv("SENDGRID_FROM_EMAIL"),
      subject: `${senderName} shared a Shop Boost analysis for ${context.shopName}`,
      text: [
        `This analysis was generated for ${context.shopName}.`,
        `ROI highlights and blockers are included in this read-only view.`,
        `Open analysis: ${shareLink}`,
      ].join("\n"),
    });

    const supabase = createAdminSupabase();
    const { data: existingLead } = await supabase
      .from("demo_shop_boost_leads")
      .select("id, share_count, emails_sent, lead_kind")
      .eq("demo_id", access.demoId)
      .eq("email", recipientEmail)
      .maybeSingle<{ id: string; share_count: number | null; emails_sent: number | null; lead_kind: string | null }>();

    if (existingLead?.id) {
      await supabase
        .from("demo_shop_boost_leads")
        .update({
          share_count: (existingLead.share_count ?? 0) + 1,
          emails_sent: (existingLead.emails_sent ?? 0) + 1,
          last_viewed_at: new Date().toISOString(),
          engagement_score: Math.min(100, ((existingLead.emails_sent ?? 0) + 1) * 8),
          lead_kind: existingLead.lead_kind === "activation_claim" ? "activation_claim" : "share_recipient",
        } as Record<string, unknown>)
        .eq("id", existingLead.id);
    } else {
      await supabase.from("demo_shop_boost_leads").insert({
        demo_id: access.demoId,
        email: recipientEmail,
        summary: `Shared by ${senderName}`,
        share_count: 1,
        emails_sent: 1,
        engagement_score: 8,
        lead_kind: "share_recipient",
      } as Record<string, unknown>);
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
