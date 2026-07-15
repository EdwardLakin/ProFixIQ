import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function must(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      work_order_line_id?: string;
      tech_id?: string;
      operationKey?: string;
      idempotencyKey?: string;
    } | null;

    const lineId = body?.work_order_line_id?.trim() ?? "";
    const techId = body?.tech_id?.trim() ?? "";
    const rawOperationKey =
      req.headers.get("Idempotency-Key")?.trim() ||
      body?.operationKey?.trim() ||
      body?.idempotencyKey?.trim() ||
      "";

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canAssignWork",
    });
    if (!access.ok) return access.response;

    if (!lineId || !techId) {
      return NextResponse.json(
        { error: "work_order_line_id and tech_id are required" },
        { status: 400 },
      );
    }
    if (!rawOperationKey) {
      return NextResponse.json(
        { error: "A stable Idempotency-Key is required." },
        { status: 400 },
      );
    }

    const admin = createClient<DB>(
      must("NEXT_PUBLIC_SUPABASE_URL"),
      must("SUPABASE_SERVICE_ROLE_KEY"),
    ) as unknown as RpcClient;

    const { data, error } = await admin.rpc(
      "assign_work_order_line_technician_atomic",
      {
        p_shop_id: access.profile.shop_id,
        p_work_order_line_id: lineId,
        p_technician_id: techId,
        p_assigned_by: access.profile.id,
        p_operation_key: `${access.profile.shop_id}:assign-line:${rawOperationKey}`,
      },
    );

    if (error) {
      const message = [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" — ");
      const status = message.includes("FINANCIALLY_LOCKED") ? 409 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
