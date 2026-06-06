import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";

type QuoteReviewLine = Pick<Database["public"]["Tables"]["work_order_lines"]["Row"], "status" | "approval_state" | "labor_time">;

const PENDING_LINE_STATUSES = new Set(["waiting_for_approval", "awaiting_approval"]);

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user || !actor.shopId) {
    console.info("[QuoteReview] server auth unavailable", {
      actorPresent: Boolean(actor.user),
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/work-orders/quote-review",
      table: "work_orders",
    });
    return NextResponse.json({ error: "You must be signed in to view quote approvals." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("work_orders")
    .select(
      `
      *,
      shops(name),
      work_order_lines(id,status,approval_state,labor_time,line_no,description,created_at,updated_at),
      work_order_quote_lines(id,stage)
    `,
    )
    .eq("shop_id", actor.shopId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.info("[QuoteReview] query failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/work-orders/quote-review",
      table: "work_orders",
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).filter((workOrder) => {
    const status = safeTrim(workOrder.status).toLowerCase();
    if (status === "awaiting_approval") return true;

    const lines: QuoteReviewLine[] = Array.isArray(workOrder.work_order_lines) ? workOrder.work_order_lines : [];
    return lines.some((line) => {
      const lineStatus = safeTrim(line?.status).toLowerCase();
      const approvalState = safeTrim(line?.approval_state).toLowerCase();
      return PENDING_LINE_STATUSES.has(lineStatus) || approvalState === "pending";
    });
  }).map((workOrder) => {
    const lines: QuoteReviewLine[] = Array.isArray(workOrder.work_order_lines) ? workOrder.work_order_lines : [];
    const quoteLines = Array.isArray(workOrder.work_order_quote_lines) ? workOrder.work_order_quote_lines : [];

    return {
      ...workOrder,
      labor_hours: lines.reduce((sum: number, line: QuoteReviewLine) => sum + (typeof line.labor_time === "number" ? line.labor_time : 0), 0),
      waiting_for_parts: quoteLines.length === 0,
    };
  });

  return NextResponse.json({ rows });
}
