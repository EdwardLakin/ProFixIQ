import "server-only";

import { NextResponse } from "next/server";

// Best-effort, per-instance sliding-window limiter for unauthenticated public
// routes (demo uploads/run/claim/share). It needs no schema, so it is a first
// line of defence only: each serverless instance keeps its own counters. Pair
// it with a Vercel WAF rate-limit rule for a durable, fleet-wide cap.

const MAX_TRACKED_KEYS = 5000;
const buckets = new Map<string, number[]>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function consumeRateLimit(args: {
  key: string;
  max: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  const now = args.now ?? Date.now();
  const windowStart = now - args.windowMs;
  const recent = (buckets.get(args.key) ?? []).filter((at) => at > windowStart);

  if (recent.length >= args.max) {
    buckets.set(args.key, recent);
    const oldest = recent[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + args.windowMs - now) / 1000)),
    };
  }

  recent.push(now);
  buckets.set(args.key, recent);

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [key, hits] of buckets) {
      if (!hits.some((at) => at > windowStart)) buckets.delete(key);
      if (buckets.size <= MAX_TRACKED_KEYS) break;
    }
  }

  return { allowed: true };
}

/** First hop of x-forwarded-for (set by the platform proxy), or null when absent. */
export function clientKeyFromRequest(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  const value = forwarded || real;
  return value && value.length <= 64 ? value : null;
}

/**
 * Rate-limit a public route per client address. Returns a 429 response when the
 * caller is over the limit, otherwise null. Requests with no resolvable client
 * address are not limited here (a shared "unknown" bucket would throttle
 * everyone together).
 */
export function tooManyRequestsResponse(
  retryAfterSeconds: number,
): NextResponse<{ ok: false; error: string }> {
  return NextResponse.json<{ ok: false; error: string }>(
    { ok: false, error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}

export function enforcePublicRouteRateLimit(args: {
  request: Request;
  route: string;
  max: number;
  windowMs: number;
}): NextResponse<{ ok: false; error: string }> | null {
  const client = clientKeyFromRequest(args.request);
  if (!client) return null;

  const result = consumeRateLimit({
    key: `${args.route}:${client}`,
    max: args.max,
    windowMs: args.windowMs,
  });
  if (result.allowed) return null;

  return tooManyRequestsResponse(result.retryAfterSeconds);
}
