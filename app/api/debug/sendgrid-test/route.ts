import { NextRequest, NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";

export const runtime = "nodejs";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

// Tiny guard so we get a clear error if the key is missing in prod
if (!SENDGRID_API_KEY) {
  // This will only run at build / first import time on the server
  console.error(
    "[sendgrid-test] Missing SENDGRID_API_KEY env var. Emails will fail."
  );
} else {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { to?: string };

    if (!body.to) {
      return NextResponse.json(
        { ok: false, error: "Missing 'to' field in body" },
        { status: 400 }
      );
    }

    const msg = {
      to: body.to,
      from: "support@profixiq.com", // ✅ your support address
      subject: "ProFixIQ SendGrid Debug Test",
      text: "If you see this, SendGrid + Vercel are wired up correctly.",
    };

    const result = await sgMail.send(msg);

    return NextResponse.json(
      {
        ok: true,
        statusCode: result[0]?.statusCode ?? null,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    // Properly narrowed error type to avoid `any`
    let errorPayload: unknown = "Unknown error";

    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof (error as { response?: unknown }).response === "object" &&
      (error as { response?: { body?: unknown } }).response?.body
    ) {
      errorPayload = (error as { response: { body?: unknown } }).response.body;
    } else if (error instanceof Error) {
      errorPayload = error.message;
    }

    console.error("[sendgrid-test] SendGrid error:", errorPayload);

    return NextResponse.json(
      {
        ok: false,
        error: errorPayload,
      },
      { status: 500 }
    );
  }
}
