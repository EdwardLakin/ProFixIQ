/**
 * Resolves a bounded row cap from an optional `?limit=` query param, clamped
 * to [1, maxLimit] and defaulting to maxLimit when absent or unparsable.
 *
 * `URLSearchParams#get` returns `null` (not `undefined`) for a missing
 * param, and `Number(null)` is `0` — a finite number — not `NaN`. Passing
 * that straight to `Number()` before checking `Number.isFinite` silently
 * treated "no limit supplied" as an explicit `limit=0`, which then clamped
 * to `Math.max(1, 0)` and capped the caller's query to exactly one row.
 *
 * Lives outside app/api/.../route.ts because a Next.js App Router route file
 * may only export its HTTP method handlers and a small whitelist of config
 * constants — any other named export fails the build with "is not a valid
 * Route export field."
 */
export function resolveAssignedQueueLimit(
  url: URL,
  maxLimit: number,
): number {
  const raw = url.searchParams.get("limit");
  const parsed = raw !== null && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isFinite(parsed)
    ? Math.min(maxLimit, Math.max(1, Math.trunc(parsed)))
    : maxLimit;
}
