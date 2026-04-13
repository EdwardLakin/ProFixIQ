import { receiveFromCanonicalBody } from "../../../../_lib/receivePartRequestItem";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const { itemId: rawItemId } = await ctx.params;
  const itemId = typeof rawItemId === "string" ? rawItemId.trim() : "";
  return receiveFromCanonicalBody(req, itemId);
}
