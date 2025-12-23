import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { email, redirectTo } = await req.json();

    if (!email) {
      return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

    // 1️⃣ Generate Supabase magic link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: redirectTo || `${process.env.NEXT_PUBLIC_SITE_URL}/portal`,
      },
    });

    if (error || !data?.properties?.action_link) {
      throw error || new Error("Failed to generate magic link");
    }

    const link = data.properties.action_link;

    // 2️⃣ Send via SendGrid
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL!,
        name: "ProFixIQ",
      },
      subject: "Access your customer portal",
      html: `
        <p>You can access your customer portal using the secure link below:</p>
        <p>
          <a href="${link}" style="padding:10px 14px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;">
            Open Customer Portal
          </a>
        </p>
        <p style="font-size:12px;color:#94a3b8">
          This link expires automatically and is single-use.
        </p>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[portal invite]", e);
    return NextResponse.json(
      { ok: false, error: "Failed to send portal invite" },
      { status: 500 },
    );
  }
}