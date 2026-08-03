import { POST as canonicalPost } from "../../ai/summarize-stats/route";

const LEGACY_RANGE_ALIASES = new Map<string, string>([
  ["week", "weekly"],
  ["weekly", "weekly"],
  ["7d", "weekly"],
  ["last_7_days", "weekly"],
  ["month", "monthly"],
  ["monthly", "monthly"],
  ["30d", "monthly"],
  ["last_30_days", "monthly"],
  ["quarter", "quarterly"],
  ["quarterly", "quarterly"],
  ["90d", "quarterly"],
  ["year", "yearly"],
  ["yearly", "yearly"],
  ["12m", "yearly"],
]);

function normalizeRange(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return LEGACY_RANGE_ALIASES.get(normalized) ?? null;
}

// Legacy compatibility route. The canonical handler enforces
// requireShopScopedApiAccess, usage controls, caching, and evidence building.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    range?: unknown;
    timeRange?: unknown;
    force?: unknown;
  } | null;

  const range = normalizeRange(body?.range) ?? normalizeRange(body?.timeRange);
  const canonicalRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      range: range ?? body?.range ?? body?.timeRange ?? null,
      force: body?.force === true,
    }),
  });

  return canonicalPost(canonicalRequest);
}
