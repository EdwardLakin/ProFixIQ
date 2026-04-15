import { NextRequest, NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostShareHref } from "@/features/integrations/shopBoost/shareAccess";

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
      demoId?: string;
      intakeId?: string;
      recipientEmail?: string;
      senderName?: string;
    };

    const demoId = body.demoId?.trim() ?? "";
    const intakeId = body.intakeId?.trim() ?? "";
    const recipientEmail = body.recipientEmail?.trim() ?? "";
    const senderName = body.senderName?.trim() || "ProFixIQ Shop Boost";

    if (!demoId || !intakeId || !isEmail(recipientEmail)) {
      return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: demo } = await supabase
      .from("demo_shop_boosts")
      .select("id, shop_name")
      .eq("id", demoId)
      .maybeSingle<{ id: string; shop_name: string }>();

    if (!demo) return NextResponse.json({ ok: false, error: "Demo not found." }, { status: 404 });

    const origin = new URL(req.url).origin;
    const shareLink = buildShopBoostShareHref({
      origin,
      demoId,
      intakeId,
      senderName,
      expiresInDays: 7,
    });

    sgMail.setApiKey(requiredEnv("SENDGRID_API_KEY"));
    await sgMail.send({
      to: recipientEmail,
      from: requiredEnv("SENDGRID_FROM_EMAIL"),
      subject: `${senderName} shared a Shop Boost analysis for ${demo.shop_name}`,
      text: [
        `This analysis was generated for ${demo.shop_name}.`,
        `ROI highlights and blockers are included in this read-only view.`,
        `Open analysis: ${shareLink}`,
      ].join("\n"),
    });

    const { data: existingLead } = await supabase
      .from("demo_shop_boost_leads")
      .select("id, share_count, emails_sent")
      .eq("demo_id", demoId)
      .eq("email", recipientEmail)
      .maybeSingle<{ id: string; share_count: number | null; emails_sent: number | null }>();

    if (existingLead?.id) {
      await supabase
        .from("demo_shop_boost_leads")
        .update({
          share_count: (existingLead.share_count ?? 0) + 1,
          emails_sent: (existingLead.emails_sent ?? 0) + 1,
          last_viewed_at: new Date().toISOString(),
          engagement_score: Math.min(100, ((existingLead.emails_sent ?? 0) + 1) * 8),
        } as Record<string, unknown>)
        .eq("id", existingLead.id);
    } else {
      await supabase.from("demo_shop_boost_leads").insert({
        demo_id: demoId,
        email: recipientEmail,
        summary: `Shared by ${senderName}`,
        share_count: 1,
        emails_sent: 1,
        engagement_score: 8,
      } as Record<string, unknown>);
    }

    return NextResponse.json({ ok: true, shareLink });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send share email.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
