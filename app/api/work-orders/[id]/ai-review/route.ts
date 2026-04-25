import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { reviewWorkOrder } from "../_lib/reviewWorkOrder";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

function getIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/"); // ["", "api", "work-orders", "<id>", "ai-review"]
  return parts.length >= 5 ? parts[3] : null;
}

function isError(x: unknown): x is Error {
  return typeof x === "object" && x !== null && "message" in x;
}

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

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) {
    return NextResponse.json(
      { ok: false, issues: [{ kind: "forbidden", message: "Shop not found" }] },
      { status: 403 },
    );
  }

  const woId = getIdFromUrl(req.url);

  if (!woId) {
    return NextResponse.json(
      { ok: false, issues: [{ kind: "bad_request", message: "Missing work order id" }] },
      { status: 400 },
    );
  }

  try {
    const scopedWorkOrder = await getShopScopedWorkOrder({
      supabase: access.supabase,
      workOrderId: woId,
      shopId,
    });

    if (!scopedWorkOrder) {
      return NextResponse.json(
        { ok: false, issues: [{ kind: "missing_wo", message: "WO not found" }] },
        { status: 404 },
      );
    }

    const result = await reviewWorkOrder({
      supabase: access.supabase,
      workOrderId: woId,
      shopId,
      kind: "ai_review",
    });

    if (!result.ok && result.issues.some((i) => i.kind === "missing_wo")) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "AI review failed";
    return NextResponse.json(
      { ok: false, issues: [{ kind: "error", message: msg }] },
      { status: 500 },
    );
  }
}
