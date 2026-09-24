export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { submitDemoAccessRequest } from "@/features/ops/server/demoAccessRequests";

type Body = {
  fullName?: unknown;
  email?: unknown;
  companyName?: unknown;
  message?: unknown;
  website?: unknown;
};

// Intentionally unauthenticated -- this is the public "Request Demo Access"
// form on the landing page. It only ever writes to demo_access_requests
// (never profiles/shop_members/any provisioning path); every request sits
// pending until an ops operator approves or dismisses it from
// /ops/demo-access. See features/ops/server/demoAccessRequests.ts for the
// honeypot and resubmit-cooldown handling.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName : "";
  const email = typeof body.email === "string" ? body.email : "";
  const companyName = typeof body.companyName === "string" ? body.companyName : undefined;
  const message = typeof body.message === "string" ? body.message : undefined;
  const website = typeof body.website === "string" ? body.website : undefined;

  try {
    await submitDemoAccessRequest({ fullName, email, companyName, message, website });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to submit demo access request.";
    console.error("[public/demo-request]", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
