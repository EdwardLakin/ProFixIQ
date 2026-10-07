export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { readBoundedJson } from "@/features/shared/lib/server/bounded-json";
import { enforcePublicRouteRateLimit } from "@/features/shared/lib/server/publicRouteRateLimit";
import { createEarlyAccessCheckout } from "@/features/stripe/lib/server/early-access-checkout";

const REQUEST_MAX_BYTES = 2 * 1024;

type Body = { token?: unknown };

// Only messages the checkout service can actually throw for an applicant are
// shown. Anything else stays generic so internal detail never reaches a
// public caller.
const APPLICANT_SAFE_ERRORS = new Set([
  "Early Access approval link is invalid.",
  "Early Access approval link is invalid or has already been used.",
  "Early Access approval has expired.",
  "Early Access approval is invalid.",
  "Early Access approval is no longer valid.",
]);

const RENEW_LINK_MESSAGE =
  "This Early Access link needs to be renewed. Please contact ProFixIQ for a new private signup link.";

function publicCheckoutError(message: string): string {
  if (APPLICANT_SAFE_ERRORS.has(message)) return message;
  if (message.startsWith("Early Access checkout has too many abandoned attempts")) {
    return RENEW_LINK_MESSAGE;
  }
  return "Early Access checkout is temporarily unavailable.";
}

export async function POST(request: Request) {
  const limited = enforcePublicRouteRateLimit({
    request,
    route: "public-early-access-checkout",
    max: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const bounded = await readBoundedJson(request, REQUEST_MAX_BYTES);
  if (!bounded.ok) {
    return NextResponse.json(
      {
        error:
          bounded.reason === "too_large" ? "Request too large." : "Invalid request.",
      },
      { status: bounded.reason === "too_large" ? 413 : 400 },
    );
  }
  const body = (bounded.value && typeof bounded.value === "object"
    ? bounded.value
    : null) as Body | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Early Access approval token is required." }, { status: 400 });
  }

  try {
    const checkout = await createEarlyAccessCheckout(token);
    return NextResponse.json({ ok: true, ...checkout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Early Access checkout unavailable.";
    console.error("[public/early-access/checkout]", message);
    return NextResponse.json({ error: publicCheckoutError(message) }, { status: 400 });
  }
}
