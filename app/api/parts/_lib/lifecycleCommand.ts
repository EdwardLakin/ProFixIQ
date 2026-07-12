import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value.trim());
}

export function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function idempotencyKey(req: Request, body: Record<string, unknown>, fallback: string): string {
  const header = req.headers.get("Idempotency-Key")?.trim();
  const fromBody = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  return header || fromBody || fallback;
}

export async function runPartsLifecycleRpc(_req: Request, rpc: string, args: Record<string, unknown>) {
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;
  const { data, error } = await access.supabase.rpc(rpc as never, args as never);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true, result: data });
}
