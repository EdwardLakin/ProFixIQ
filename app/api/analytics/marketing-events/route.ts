import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { readBoundedJson } from "@/features/shared/lib/server/bounded-json";
import { enforcePublicRouteRateLimit } from "@/features/shared/lib/server/publicRouteRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_MAX_BYTES = 4 * 1024;

// Only client-observable intent events are accepted by this anonymous route.
// Outcome events such as checkout/signup/onboarding must be written by their
// authoritative server-side success boundaries instead.
const EVENT_NAMES = new Set([
  "marketing_trial_click",
  "marketing_demo_click",
  "marketing_subscribe_click",
  "pricing_view",
]);

const PACKAGE_KEYS = new Set([
  "shop_operations",
  "field_service",
  "fleet_maintenance",
  "complete_operations",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanString(value: unknown, max = 256): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanPath(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://profixiq.com");
    return url.pathname.slice(0, 256);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const rateLimitResponse = enforcePublicRouteRateLimit({
    request,
    route: "marketing-events",
    max: 60,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const bodyResult = await readBoundedJson(request, REQUEST_MAX_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json(
      {
        error:
          bodyResult.reason === "too_large"
            ? "payload_too_large"
            : "invalid_json",
      },
      { status: bodyResult.reason === "too_large" ? 413 : 400 },
    );
  }

  const body = bodyResult.value as Record<string, unknown> | null;
  const event = cleanString(body?.event, 64);
  if (!event || !EVENT_NAMES.has(event)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  const packageKey = cleanString(body?.packageKey, 64);
  const interval = cleanString(body?.interval, 16);
  const checkoutMode = cleanString(body?.checkoutMode, 16);
  const checkoutAttemptId = cleanString(body?.checkoutAttemptId, 64);
  const anonymousSessionId = cleanString(body?.anonymousSessionId, 64);

  if (packageKey && !PACKAGE_KEYS.has(packageKey)) {
    return NextResponse.json({ error: "invalid_package" }, { status: 400 });
  }
  if (interval && interval !== "monthly" && interval !== "yearly") {
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });
  }
  if (checkoutMode && checkoutMode !== "trial" && checkoutMode !== "paid") {
    return NextResponse.json({ error: "invalid_checkout_mode" }, { status: 400 });
  }
  if (checkoutAttemptId && !UUID_RE.test(checkoutAttemptId)) {
    return NextResponse.json({ error: "invalid_checkout_attempt" }, { status: 400 });
  }
  if (anonymousSessionId && !UUID_RE.test(anonymousSessionId)) {
    return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "analytics_unavailable" }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.from("marketing_events").insert({
    event_name: event,
    source_path: cleanPath(body?.source),
    destination:
      body?.destination === "stripe_checkout"
        ? "stripe_checkout"
        : cleanPath(body?.destination),
    package_key: packageKey,
    interval,
    checkout_mode: checkoutMode,
    checkout_attempt_id: checkoutAttemptId,
    anonymous_session_id: anonymousSessionId,
  });

  if (error) {
    console.error("[marketing-events] insert failed", { code: error.code });
    return NextResponse.json({ error: "analytics_write_failed" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
