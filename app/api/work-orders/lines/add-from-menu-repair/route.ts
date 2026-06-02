import { POST as addQuoteLineFromMenuRepair } from "../../quotes/add-from-menu-repair/route";

// Deprecated Phase 5D-5A compatibility route.
// Repair-intelligence menu reuse must create canonical work_order_quote_lines,
// not direct work_order_lines. Keep this legacy URL available for any stale
// clients while forwarding it to the canonical quote-line reuse endpoint.
export async function POST(req: Request) {
  return addQuoteLineFromMenuRepair(req);
}
