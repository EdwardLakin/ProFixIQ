import "server-only";

import { NextResponse } from "next/server";
import {
  isCustomerVisibleDirectWorkOrderLine,
  isCustomerVisibleQuoteLine,
} from "@/features/portal/lib/quoteApprovalPresentation";
import { sanitizeCustomerVisibleQuoteMetadata } from "@/features/portal/lib/customerVisibleQuoteParts";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function portalError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: workOrderId } = await context.params;
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const shopId = actor.customer.shop_id;
    if (!shopId) {
      return portalError("Customer portal is not connected to a shop.", 403);
    }

    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select(
        "id,shop_id,customer_id,custom_id,estimate_number,scheduled_at,invoice_sent_at,inspection_id,shop_supplies_enabled_override,shop_supplies_amount_override",
      )
      .eq("id", workOrderId)
      .eq("shop_id", shopId)
      .eq("customer_id", actor.customer.id)
      .maybeSingle();

    if (workOrderError) {
      console.error("[portal/quotes/detail] work order lookup failed", {
        workOrderId,
        actorId: actor.userId,
        message: workOrderError.message,
      });
      return portalError("This quote could not be loaded.", 500);
    }
    if (!workOrder?.id) {
      return portalError("This quote is unavailable.", 404);
    }

    const [shopResult, quoteResult, directLineResult, directPartResult] =
      await Promise.all([
        supabase
          .from("shops")
          .select(
            "id,labor_rate,province,supplies_percent,shop_supplies_enabled,shop_supplies_type,shop_supplies_percent,shop_supplies_flat_amount,shop_supplies_cap_amount",
          )
          .eq("id", shopId)
          .maybeSingle(),
        supabase
          .from("work_order_quote_lines")
          .select(
            "id,description,ai_complaint,ai_cause,ai_correction,notes,job_type,labor_hours,est_labor_hours,labor_total,parts_total,subtotal,tax_total,grand_total,status,stage,sent_to_customer_at,approved_at,declined_at,work_order_line_id,metadata,created_at,updated_at",
          )
          .eq("work_order_id", workOrderId)
          .eq("shop_id", shopId)
          .order("created_at", { ascending: true }),
        supabase
          .from("work_order_lines")
          .select(
            "id,line_no,description,complaint,cause,correction,notes,technician_notes,labor_time,price_estimate,status,line_status,approval_state,approval_at,quoted_at,created_at,updated_at,voided_at",
          )
          .eq("work_order_id", workOrderId)
          .eq("shop_id", shopId)
          .order("line_no", { ascending: true }),
        supabase
          .from("work_order_parts")
          .select(
            "id,work_order_line_id,description_snapshot,part_number_snapshot,manufacturer_snapshot,quantity,unit_price,total_price,is_active",
          )
          .eq("work_order_id", workOrderId)
          .eq("shop_id", shopId)
          .eq("is_active", true),
      ]);

    const coreError =
      shopResult.error ??
      quoteResult.error ??
      directLineResult.error ??
      directPartResult.error;
    if (coreError) {
      console.error("[portal/quotes/detail] quote data lookup failed", {
        workOrderId,
        actorId: actor.userId,
        message: coreError.message,
      });
      return portalError("This quote could not be loaded.", 500);
    }

    const quoteLines = (quoteResult.data ?? [])
      .filter((line) =>
        isCustomerVisibleQuoteLine(line as unknown as Record<string, unknown>),
      )
      .map((line) => ({
        ...line,
        metadata: sanitizeCustomerVisibleQuoteMetadata(line.metadata),
      }));
    const linkedWorkOrderLineIds = new Set(
      quoteLines
        .map((line) => line.work_order_line_id)
        .filter((id): id is string => Boolean(id)),
    );
    const workOrderLines = (directLineResult.data ?? []).filter(
      (line) =>
        !linkedWorkOrderLineIds.has(line.id) &&
        isCustomerVisibleDirectWorkOrderLine(
          line as unknown as Record<string, unknown>,
        ),
    );

    if (quoteLines.length === 0 && workOrderLines.length === 0) {
      return portalError("This quote is unavailable.", 404);
    }

    const visibleWorkOrderLineIds = new Set(
      workOrderLines.map((line) => line.id),
    );
    for (const lineId of linkedWorkOrderLineIds) {
      visibleWorkOrderLineIds.add(lineId);
    }
    const workOrderParts = (directPartResult.data ?? []).filter(
      (part) =>
        part.work_order_line_id != null &&
        visibleWorkOrderLineIds.has(part.work_order_line_id),
    );

    let inspectionPhotos: Array<{
      image_url: string | null;
      item_name: string | null;
    }> = [];
    let inspectionPhotosUnavailable = false;
    if (workOrder.inspection_id) {
      const { data, error } = await supabase
        .from("inspection_photos")
        .select("image_url,item_name")
        .eq("inspection_id", workOrder.inspection_id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        inspectionPhotosUnavailable = true;
      } else {
        inspectionPhotos = data ?? [];
      }
    }

    return NextResponse.json({
      workOrder,
      shop: shopResult.data ?? null,
      quoteLines,
      workOrderLines,
      workOrderParts,
      inspectionPhotos,
      inspectionPhotosUnavailable,
    });
  } catch (error) {
    if (error instanceof PortalAccessError) {
      return portalError(error.message, error.status);
    }
    console.error("[portal/quotes/detail] unexpected failure", {
      workOrderId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return portalError("This quote could not be loaded.", 500);
  }
}
