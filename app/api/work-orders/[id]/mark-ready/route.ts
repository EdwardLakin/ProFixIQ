import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildWorkOrderCompletedEvent } from "@/features/integrations/shopreel/server/buildProFixIQStoryEvents";
import { postStoryEventToShopReel } from "@/features/integrations/shopreel/server/postStoryEventToShopReel";
import { syncWorkOrderToHistory } from "@/features/work-orders/server/syncWorkOrderToHistory";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { seedCompletedWorkOrderIntelligence } from "@/features/ai/server/workOrderIntelligence";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type Body = {
  operationKey?: string | null;
  idempotencyKey?: string | null;
};

function getIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/");
  return parts.length >= 5 ? parts[3] : null;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stableKey(actorId: string, workOrderId: string): string {
  return crypto
    .createHash("sha256")
    .update(`mark-ready:${actorId}:${workOrderId}`)
    .digest("hex");
}

function errorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return 404;
  if (lower.includes("not authorized")) return 403;
  if (
    lower.includes("financially_locked") ||
    lower.includes("must be completed") ||
    lower.includes("pending quote") ||
    lower.includes("no active lines")
  ) {
    return 409;
  }
  return 400;
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const workOrderId = getIdFromUrl(req.url);
  if (!workOrderId) {
    return NextResponse.json(
      { ok: false, error: "Missing work order id" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    clean(body?.operationKey) ||
    clean(body?.idempotencyKey) ||
    stableKey(access.profile.id, workOrderId);

  try {
    const draft = await getInvoiceSnapshotForWorkOrder({
      supabase: access.supabase,
      workOrderId,
    });
    const issuable = await getIssuableInvoiceSnapshot({
      supabase: access.supabase,
      workOrderId,
      shopId: access.profile.shop_id,
    });
    const draftTotal = Number(draft.total ?? 0);
    const draftParts = Number(draft.partsCost ?? 0);
    const issuableTotal = Number(issuable.total ?? 0);
    const issuableParts = Number(issuable.partsCost ?? 0);
    if (!Number.isFinite(draftTotal) || draftTotal <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invoice pricing must be completed before marking the work order ready." },
        { status: 409 },
      );
    }
    if (
      Math.abs(draftParts - issuableParts) > 0.01 ||
      Math.abs(draftTotal - issuableTotal) > 0.01
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Approved parts must be attached to the work order before it can be marked ready to invoice.",
        },
        { status: 409 },
      );
    }
  } catch (pricingError: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          pricingError instanceof Error
            ? pricingError.message
            : "Invoice pricing could not be verified.",
      },
      { status: 409 },
    );
  }

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("mark_work_order_ready_atomic", {
    p_shop_id: access.profile.shop_id,
    p_work_order_id: workOrderId,
    p_actor_user_id: access.profile.id,
    p_operation_key: `${access.profile.shop_id}:mark-ready:${operationKey}`,
    p_at: new Date().toISOString(),
  });

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json(
      { ok: false, error: message },
      { status: errorStatus(message) },
    );
  }

  const event = await buildWorkOrderCompletedEvent(workOrderId);
  if (event) {
    await postStoryEventToShopReel(event).catch((storyError: unknown) => {
      console.error("[shopreel] failed to sync completed work order", storyError);
    });
  }

  let historySync:
    | { ok: true; historyId: string | null; skippedReason?: string }
    | null = null;
  try {
    historySync = await syncWorkOrderToHistory(access.supabase, workOrderId);
  } catch (historyError) {
    console.warn("[work-orders/mark-ready] history sync failed:", historyError);
  }

  try {
    await seedCompletedWorkOrderIntelligence({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      workOrderId,
      source: "ready_to_invoice",
    });
  } catch (intelligenceError) {
    console.warn(
      "[work-orders/mark-ready] completed-repair learning failed:",
      intelligenceError,
    );
  }

  return NextResponse.json({
    ...(data && typeof data === "object" ? data : { ok: true }),
    historySync,
  });
}
