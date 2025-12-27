import { NextRequest, NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

if (!SENDGRID_API_KEY) {
  console.error("[sendgrid-test] Missing SENDGRID_API_KEY env var");
}
if (!SENDGRID_FROM_EMAIL) {
  console.error("[sendgrid-test] Missing SENDGRID_FROM_EMAIL env var");
}

sgMail.setApiKey(SENDGRID_API_KEY ?? "");

type DebugBody = {
  to: string;
};

export async function POST(req: NextRequest) {
  try {
    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      return NextResponse.json(
        { ok: false, error: "Missing SendGrid configuration" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as DebugBody;
    const to = body.to?.trim();

    if (!to) {
      return NextResponse.json(
        { ok: false, error: "Missing 'to' email" },
        { status: 400 },
      );
    }

    const msg = {
      to,
      from: SENDGRID_FROM_EMAIL,
      subject: "ProFixIQ SendGrid test",
      text: "If you see this, SendGrid is configured and working 🎉",
      html: "<p>If you see this, SendGrid is configured and working 🎉</p>",
    };

    const [resp] = await sgMail.send(msg);

    console.log("[sendgrid-test] status:", resp.statusCode);

    return NextResponse.json({
      ok: true,
      statusCode: resp.statusCode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sendgrid-test] error:", message);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}