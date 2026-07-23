import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Json } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const SCHEMA_COMPATIBILITY_ERROR =
  "no unique or exclusion constraint matching the on conflict";

function isInspectionRevisionConflict(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("inspection save conflicts with a newer server version") ||
    lower.includes("inspection is finalized and locked") ||
    lower.includes("inspection was finalized while autosave was in progress") ||
    lower.includes("inspection changed or was finalized while autosave was in progress")
  );
}

function isMissingCanonicalWriter(error: RpcError | null): boolean {
  if (!error) return false;
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    error.code === "PGRST202" ||
    (message.includes("save_inspection_progress_v3_atomic") &&
      (message.includes("not find") || message.includes("does not exist")))
  );
}

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

  let profileResult = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();
  if (!profileResult.data && !profileResult.error) {
    profileResult = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle<{ shop_id: string | null }>();
  }
  const profile = profileResult.data;
  const profileError = profileResult.error;
  if (profileError || !profile?.shop_id) {
    return NextResponse.json(
      { error: "Unable to resolve actor shop." },
      { status: 403 },
    );
  }

  const rpc = supabase as unknown as RpcClient;
  const rpcArgs = {
    p_shop_id: profile.shop_id,
    p_work_order_line_id: workOrderLineId,
    p_actor_user_id: user.id,
    p_session: session as unknown as Json,
    p_operation_key: `${profile.shop_id}:inspection-progress:${operationKey}`,
    p_at: new Date().toISOString(),
  };
  const { data, error } = await rpc.rpc(
    "save_inspection_progress_v3_atomic",
    rpcArgs,
  );

  // Do not fall back to a writer that mirrors progress into inspection_sessions.
  // The canonical migration must be deployed before this application build.
  if (isMissingCanonicalWriter(error)) {
    return NextResponse.json(
      {
        error:
          "Inspection sync is waiting for the canonical server migration.",
        code: "INSPECTION_CANONICAL_WRITER_UNAVAILABLE",
        retryable: true,
        workOrderLineId,
      },
      { status: 503 },
    );
  }

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const lower = message.toLowerCase();
    // PostgreSQL uses "ON CONFLICT" in schema errors. Never classify that
    // wording as a user-data revision conflict: doing so permanently strands
    // an otherwise retryable mobile snapshot in IndexedDB.
    if (lower.includes(SCHEMA_COMPATIBILITY_ERROR)) {
      return NextResponse.json(
        {
          error:
            "Inspection sync is temporarily unavailable while the server writer is updated.",
          code: "INSPECTION_WRITER_UNAVAILABLE",
          retryable: true,
          workOrderLineId,
        },
        { status: 503 },
      );
    }

    const status = isInspectionRevisionConflict(message)
      ? 409
      : lower.includes("work-order line not found")
        ? 404
        : 400;
    if (status === 409) {
      const { data: canonical } = await supabase
        .from("inspections")
        .select("id, sync_revision, updated_at")
        .eq("shop_id", profile.shop_id)
        .eq("work_order_line_id", workOrderLineId)
        .eq("is_canonical", true)
        .maybeSingle<{
          id: string;
          sync_revision: number | null;
          updated_at: string | null;
        }>();
      return NextResponse.json(
        {
          error: message,
          code: "INSPECTION_REVISION_CONFLICT",
          recoveryRequired: true,
          workOrderLineId,
          canonicalInspectionId: canonical?.id ?? null,
          serverRevision: canonical?.sync_revision ?? null,
          serverUpdatedAt: canonical?.updated_at ?? null,
        },
        { status },
      );
    }

    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data ?? { ok: true });
}
