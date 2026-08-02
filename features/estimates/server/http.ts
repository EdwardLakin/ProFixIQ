import "server-only";

import { NextResponse } from "next/server";

// PostgreSQL allows NULL function arguments, but generated Supabase RPC types
// cannot represent parameter nullability. Keep that mismatch at this boundary.
export function nullableRpcString(
  value: string | null | undefined,
): string {
  return value ?? (null as unknown as string);
}

export function requireIdempotencyKey(
  request: Request,
): { ok: true; key: string } | { ok: false; response: NextResponse } {
  const key = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!key || key.length > 200) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "A valid Idempotency-Key header is required." },
        { status: 400 },
      ),
    };
  }
  return { ok: true, key };
}

type EstimateMutationFailure =
  | string
  | { message: string; code?: string | null };

export function estimateMutationError(
  failure: EstimateMutationFailure,
): NextResponse {
  const message = typeof failure === "string" ? failure : failure.message;
  const code = typeof failure === "string" ? null : (failure.code ?? null);
  const normalized = message.toLowerCase();
  const status =
    code === "P0002" || normalized.includes("not found")
      ? 404
      : code === "42501" ||
          code === "28000" ||
          normalized.includes("actor cannot") ||
          normalized.includes("forbidden")
        ? 403
        : ["23505", "40001", "40P01", "55000"].includes(code ?? "") ||
            normalized.includes("stale") ||
            normalized.includes("current state") ||
            normalized.includes("cannot be") ||
            normalized.includes("idempotency key") ||
            normalized.includes("locked")
          ? 409
          : ["22023", "23502", "23503", "23514"].includes(code ?? "") ||
              normalized.includes("required") ||
              normalized.includes("requires") ||
              normalized.includes("must be") ||
              normalized.includes("outside") ||
              normalized.includes("invalid")
            ? 400
            : 500;

  return NextResponse.json({ error: message }, { status });
}
