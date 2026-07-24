import { POST as canonicalPost } from "../../ai/summarize-stats/route";

// Legacy compatibility route. The canonical handler enforces
// requireShopScopedApiAccess, usage controls, caching, and evidence building.
export async function POST(request: Request) {
  return canonicalPost(request);
}
