export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { enforcePublicRouteRateLimit } from "@/features/shared/lib/server/publicRouteRateLimit";
import { createEarlyAccessCheckout } from "@/features/stripe/lib/server/early-access-checkout";

type Body = { token?: unknown };

export async function POST(request: Request) {
  const limited = enforcePublicRouteRateLimit({
    request,
    route: "public-early-access-checkout",
    max: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Body | null;
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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
