import { receiveFromLegacyBody } from "../../_lib/receivePartRequestItem";

// Legacy wrapper: retained for backward compatibility.
// Canonical endpoint is /api/parts/requests/items/[itemId]/receive
export async function POST(req: Request) {
  return receiveFromLegacyBody(req);
}
