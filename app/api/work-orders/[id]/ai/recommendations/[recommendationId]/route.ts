import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acknowledgeAiRecommendation,
  dismissAiRecommendation,
  getAiRecommendation,
  resolveAiRecommendation,
} from "@/features/ai/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type LifecycleAction = "acknowledge" | "dismiss" | "resolve";

type PatchBody = {
  action?: unknown;
  note?: unknown;
};

const VALID_ACTIONS: ReadonlySet<LifecycleAction> = new Set(["acknowledge", "dismiss", "resolve"]);
const MAX_NOTE_LENGTH = 500;

async function getShopScopedWorkOrder(input: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId: string;
}): Promise<WorkOrderRow | null> {
  const { data, error } = await input.supabase
    .from("work_orders")
    .select("*")
    .eq("id", input.workOrderId)
    .eq("shop_id", input.shopId)
    .maybeSingle<WorkOrderRow>();

  if (error) throw new Error(error.message);
  return data;
}

function parsePatchBody(raw: PatchBody): { action: LifecycleAction; note: string | null } {
  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  if (!VALID_ACTIONS.has(action as LifecycleAction)) {
    throw new Error("Invalid action. Expected one of: acknowledge, dismiss, resolve.");
  }

  if (raw.note != null && typeof raw.note !== "string") {
    throw new Error("Invalid note. Expected a string.");
  }

  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error(`Note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }

  return {
    action: action as LifecycleAction,
    note: note.length > 0 ? note : null,
  };
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; recommendationId: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;

  const { id, recommendationId } = await ctx.params;

  if (!id) {
    return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  }

  if (!recommendationId) {
    return NextResponse.json({ error: "Missing recommendation id" }, { status: 400 });
  }

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  let body: { action: LifecycleAction; note: string | null };
  try {
    const raw = (await req.json().catch(() => null)) as PatchBody | null;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsePatchBody(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const scopedWorkOrder = await getShopScopedWorkOrder({
      supabase: access.supabase,
      workOrderId: id,
      shopId,
    });

    if (!scopedWorkOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const actor = {
      shopId,
      actorId: access.profile.id,
      role: access.profile.role,
      source: "manual" as const,
    };

    const recommendation = await getAiRecommendation(access.supabase, actor, recommendationId);

    if (!recommendation) {
      return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
    }

    if (
      recommendation.shop_id !== shopId ||
      recommendation.domain !== "work_orders" ||
      recommendation.subject_type !== "work_order" ||
      recommendation.subject_id !== id
    ) {
      return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
    }

    let updated;
    if (body.action === "acknowledge") {
      updated = await acknowledgeAiRecommendation(access.supabase, actor, recommendationId, { note: body.note });
    } else if (body.action === "dismiss") {
      updated = await dismissAiRecommendation(access.supabase, actor, recommendationId, { note: body.note });
    } else {
      updated = await resolveAiRecommendation(access.supabase, actor, recommendationId, { note: body.note });
    }

    return NextResponse.json({ recommendation: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update recommendation";

    if (message.includes("recommendation not found")) {
      return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
    }

    if (message.includes("invalid recommendation status transition")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to update recommendation" }, { status: 500 });
  }
}
