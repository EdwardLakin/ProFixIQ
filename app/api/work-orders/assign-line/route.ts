import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";

type DB = Database;
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const ASSIGNMENT_ACTIONS = new Set([
  "set_primary",
  "add_supporting",
  "remove_supporting",
  "clear",
]);

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
      action?: string;
      expected_updated_at?: string;
      operationKey?: string;
      idempotencyKey?: string;
    } | null;

    const lineId = body?.work_order_line_id?.trim() ?? "";
    const techId = body?.tech_id?.trim() ?? "";
    const action = body?.action?.trim() || (techId ? "set_primary" : "clear");
    const expectedUpdatedAt = body?.expected_updated_at?.trim() || null;
    const rawOperationKey =
      req.headers.get("Idempotency-Key")?.trim() ||
      body?.operationKey?.trim() ||
      body?.idempotencyKey?.trim() ||
      "";

    const access = await requireShopScopedApiAccess({
      requiredWorkspaceCapability:
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
    });
    if (!access.ok) return access.response;

    if (!lineId) {
      return NextResponse.json(
        { error: "work_order_line_id is required" },
        { status: 400 },
      );
    }
    if (!ASSIGNMENT_ACTIONS.has(action)) {
      return NextResponse.json(
        { error: "Unsupported technician assignment action." },
        { status: 400 },
      );
    }
    if (action !== "clear" && !techId) {
      return NextResponse.json(
        { error: "tech_id is required for this assignment action" },
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
        p_technician_id: techId || null,
        p_actor_user_id: access.profile.id,
        p_action: action,
        p_operation_key: `${access.profile.shop_id}:line-assignment:${action}:${rawOperationKey}`,
        p_expected_updated_at: expectedUpdatedAt,
      },
    );

    if (error) {
      const message = [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" — ");
      const status =
        message.includes("not found for shop")
          ? 404
          : message.includes("FINANCIALLY_LOCKED") ||
        message.includes("ASSIGNMENT_STALE") ||
        message.includes("ACTIVE_LABOR")
          ? 409
          : 400;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
