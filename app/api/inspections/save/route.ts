import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Json } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const raw = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(raw)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workOrderLineId = asString(raw.workOrderLineId);
  const session = (raw.session ?? null) as InspectionSession | null;
  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    asString(raw.operationKey) ||
    asString(raw.idempotencyKey);

  if (!workOrderLineId || !session) {
    return NextResponse.json(
      { error: "Missing workOrderLineId or session" },
      { status: 400 },
    );
  }
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();
  if (profileError || !profile?.shop_id) {
    return NextResponse.json(
      { error: "Unable to resolve actor shop." },
      { status: 403 },
    );
  }

  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("save_inspection_progress_atomic", {
    p_shop_id: profile.shop_id,
    p_work_order_line_id: workOrderLineId,
    p_actor_user_id: user.id,
    p_session: session as unknown as Json,
    p_operation_key: `${profile.shop_id}:inspection-progress:${operationKey}`,
    p_at: new Date().toISOString(),
  });

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const lower = message.toLowerCase();
    const status =
      lower.includes("locked") ||
      lower.includes("finalized") ||
      lower.includes("not found") ||
      lower.includes("newer server version") ||
      lower.includes("conflict")
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data ?? { ok: true });
}

