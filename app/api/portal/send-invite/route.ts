// app/api/portal/invite/route.ts
import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";

type Body = {
  email?: string;
  next?: string; // optional: where to land after confirm (must be a safe internal path like "/portal")
};

function isSafeInternalNextPath(next: string): boolean {
  // Only allow internal paths like "/portal" or "/portal/something"
  // Disallow protocol-relative URLs, absolute URLs, and weird control chars.
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  if (next.includes("\n") || next.includes("\r")) return false;
  // Optional: tighten further if you ONLY want portal pages:
  // return next === "/portal" || next.startsWith("/portal/");
  return true;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const next = typeof body.next === "string" ? body.next.trim() : "";

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Missing email" },
        { status: 400 },
      );
    }

    const siteUrl =
      (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "") ||
      "https://profixiq.com";

    // ✅ Only allow internal redirects (prevents open-redirect abuse)
    const safeNext = isSafeInternalNextPath(next) ? next : "/portal";

    // ✅ Magic link must redirect to confirm page (PKCE exchange happens there)
    const redirectTo = `${siteUrl}/portal/auth/confirm?next=${encodeURIComponent(
      safeNext,
    )}`;

    if (!process.env.SENDGRID_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "SENDGRID_API_KEY is not set" },
        { status: 500 },
      );
    }
    if (!process.env.SENDGRID_FROM_EMAIL) {
      return NextResponse.json(
        { ok: false, error: "SENDGRID_FROM_EMAIL is not set" },
        { status: 500 },
      );
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // 1️⃣ Generate Supabase magic link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    const link = data?.properties?.action_link;
    if (error || !link) {
      console.error("[portal invite] generateLink error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to generate magic link" },
        { status: 500 },
      );
    }

    // 2️⃣ Send via SendGrid (Dynamic Template if set, otherwise fallback HTML)
    const templateId = process.env.SENDGRID_PORTAL_INVITE_TEMPLATE_ID?.trim();

    if (templateId) {
      await sgMail.send({
        to: email,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL,
          name: "ProFixIQ",
        },
        templateId,
        dynamicTemplateData: {
          portal_link: link,
          next: safeNext,
          year: new Date().getFullYear(),
        },
      });
    } else {
      await sgMail.send({
        to: email,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL,
          name: "ProFixIQ",
        },
        subject: "Access your ProFixIQ customer portal",
        html: `
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto;line-height:1.4">
            <p>You can access your customer portal using the secure link below:</p>

            <p>
              <a href="${link}"
                 style="
                   display:inline-block;
                   padding:12px 18px;
                   background:#C57A4A;
                   color:#000;
                   border-radius:10px;
                   text-decoration:none;
                   font-weight:700;
                 ">
                Open Customer Portal
              </a>
            </p>

            <p style="font-size:12px;color:#94a3b8">
              This link is single-use and expires automatically.
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[portal invite] fatal:", e);
    return NextResponse.json(
      { ok: false, error: "Failed to send portal invite" },
      { status: 500 },
    );
  }
}