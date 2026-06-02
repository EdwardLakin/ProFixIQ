import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;
type QuoteInsert = DB["public"]["Tables"]["work_order_quote_lines"]["Insert"];
type PartRequestInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PartRequestItemInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];

type QuotePart = {
  description?: string;
  name?: string;
  qty?: number;
  cost?: number | null;
  unitCost?: number | null;
  unitPrice?: number | null;
  notes?: string | null;
};

type QuoteItem = {
  id?: string | null;
  description: string;
  title?: string | null;
  jobType?: "diagnosis" | "repair" | "maintenance" | "inspection" | "tech-suggested";
  estLaborHours?: number | null;
  laborHours?: number | null;
  laborRate?: number | null;
  partsTotal?: number | null;
  laborTotal?: number | null;
  subtotal?: number | null;
  taxTotal?: number | null;
  grandTotal?: number | null;
  notes?: string | null;
  complaint?: string | null;
  aiComplaint?: string | null;
  aiCause?: string | null;
  aiCorrection?: string | null;
  status?: string | null;
  stage?: string | null;
  source?: "inspection" | string | null;
  sourceInspectionId?: string | null;
  sourceWorkOrderLineId?: string | null;
  sourceSectionKey?: string | null;
  sourceSectionTitle?: string | null;
  sourceItemKey?: string | null;
  sourceFindingTitle?: string | null;
  normalizedFindingTitle?: string | null;
  findingIdentity?: string | null;
  photoUrls?: string[];
  parts?: QuotePart[];
  metadata?: Record<string, Json | undefined> | null;
};

type Body = {
  workOrderId: string;
  vehicleId?: string | null;
  items: QuoteItem[];
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTitle(value: unknown): string {
  return safeTrim(value).toLowerCase().replace(/\s+/g, " ");
}

function cleanParts(parts: QuotePart[] | undefined): Array<{
  description: string;
  qty: number;
  unitCost: number | null;
  unitPrice: number | null;
  notes: string | null;
}> {
  return (parts ?? [])
    .map((part) => {
      const description = safeTrim(part.description) || safeTrim(part.name);
      const qty = Math.max(1, Number(part.qty) || 1);
      return {
        description,
        qty,
        unitCost: finiteNumber(part.unitCost) ?? finiteNumber(part.cost),
        unitPrice: finiteNumber(part.unitPrice),
        notes: safeTrim(part.notes) || null,
      };
    })
    .filter((part) => part.description.length > 0);
}

function identityFor(item: QuoteItem): string | null {
  const explicit = safeTrim(item.findingIdentity);
  if (explicit) return explicit;

  const inspectionId = safeTrim(item.sourceInspectionId);
  const sourceLineId = safeTrim(item.sourceWorkOrderLineId);
  const sectionKey = safeTrim(item.sourceSectionKey);
  const itemKey = safeTrim(item.sourceItemKey);
  const normalizedTitle =
    normalizeTitle(item.normalizedFindingTitle) ||
    normalizeTitle(item.sourceFindingTitle) ||
    normalizeTitle(item.title) ||
    normalizeTitle(item.description);

  const parts = [inspectionId, sourceLineId, sectionKey, itemKey, normalizedTitle].filter(Boolean);
  return parts.length > 0 ? parts.join(":") : null;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = safeTrim(body?.workOrderId);
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!workOrderId || items.length === 0) {
      return NextResponse.json(
        { error: "Missing workOrderId or items" },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) {
      return NextResponse.json(
        { error: `Failed to load work order: ${woErr.message}` },
        { status: 500 },
      );
    }

    if (!wo?.shop_id) {
      return NextResponse.json(
        { error: "Work order has no shop_id; cannot create quote lines." },
        { status: 400 },
      );
    }

    const vehicleId = safeTrim(body?.vehicleId) || wo.vehicle_id || null;
    const suggestedBy = user.id;

    const requestedIds = items.map((item) => safeTrim(item.id)).filter(Boolean);
    const identities = items.map(identityFor).filter((value): value is string => Boolean(value));

    const existingById = new Map<string, { id: string }>();
    if (requestedIds.length > 0) {
      const { data, error } = await supabase
        .from("work_order_quote_lines")
        .select("id")
        .eq("shop_id", wo.shop_id)
        .eq("work_order_id", workOrderId)
        .in("id", requestedIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (const row of data ?? []) existingById.set(row.id, row);
    }

    const existingByIdentity = new Map<string, { id: string }>();
    for (const identity of identities) {
      const { data, error } = await supabase
        .from("work_order_quote_lines")
        .select("id")
        .eq("shop_id", wo.shop_id)
        .eq("work_order_id", workOrderId)
        .contains("metadata", { inspection_finding_identity: identity })
        .limit(1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const existing = data?.[0];
      if (existing) existingByIdentity.set(identity, existing);
    }

    const rows: QuoteInsert[] = [];
    const pendingSources: QuoteItem[] = [];
    const sourceItemsById = new Map<string, QuoteItem>();
    const itemResults: Array<{
      requestedId: string | null;
      id: string;
      created: boolean;
      findingIdentity: string | null;
    }> = [];

    for (const item of items) {
      const description = safeTrim(item.description) || safeTrim(item.title);
      if (!description) continue;

      const requestedId = safeTrim(item.id) || null;
      const findingIdentity = identityFor(item);
      const existing =
        (requestedId ? existingById.get(requestedId) : undefined) ??
        (findingIdentity ? existingByIdentity.get(findingIdentity) : undefined);

      if (existing) {
        itemResults.push({
          requestedId,
          id: existing.id,
          created: false,
          findingIdentity,
        });
        continue;
      }

      const parts = cleanParts(item.parts);
      const partsTotal =
        finiteNumber(item.partsTotal) ??
        parts.reduce((sum, part) => sum + (part.unitCost ?? 0) * part.qty, 0);
      const laborHours = finiteNumber(item.laborHours) ?? finiteNumber(item.estLaborHours);
      const laborTotal = finiteNumber(item.laborTotal);
      const subtotal = finiteNumber(item.subtotal) ?? partsTotal + (laborTotal ?? 0);
      const grandTotal = finiteNumber(item.grandTotal) ?? subtotal + (finiteNumber(item.taxTotal) ?? 0);
      const normalizedFindingTitle =
        normalizeTitle(item.normalizedFindingTitle) ||
        normalizeTitle(item.sourceFindingTitle) ||
        normalizeTitle(description);

      const metadata: Record<string, Json | undefined> = {
        ...(item.metadata ?? {}),
        source: item.source ?? "inspection",
        source_inspection_id: safeTrim(item.sourceInspectionId) || undefined,
        source_work_order_line_id: safeTrim(item.sourceWorkOrderLineId) || undefined,
        source_section_key: safeTrim(item.sourceSectionKey) || undefined,
        source_section_title: safeTrim(item.sourceSectionTitle) || undefined,
        source_item_key: safeTrim(item.sourceItemKey) || undefined,
        source_finding_title: safeTrim(item.sourceFindingTitle) || description,
        source_finding_title_normalized: normalizedFindingTitle || undefined,
        inspection_finding_identity: findingIdentity ?? undefined,
        photo_urls: Array.isArray(item.photoUrls) ? item.photoUrls : [],
        parts,
        labor_rate: finiteNumber(item.laborRate) ?? undefined,
      };

      const row: QuoteInsert = {
        ...(requestedId ? { id: requestedId } : {}),
        work_order_id: workOrderId,
        work_order_line_id: null,
        shop_id: wo.shop_id,
        vehicle_id: vehicleId,
        suggested_by: suggestedBy,
        description,
        job_type: item.jobType ?? "tech-suggested",
        est_labor_hours: finiteNumber(item.estLaborHours) ?? laborHours,
        notes: safeTrim(item.notes) || safeTrim(item.complaint) || null,
        status: safeTrim(item.status) || "pending_parts",
        ai_complaint: safeTrim(item.aiComplaint) || safeTrim(item.complaint) || null,
        ai_cause: safeTrim(item.aiCause) || null,
        ai_correction: safeTrim(item.aiCorrection) || null,
        stage: safeTrim(item.stage) || "advisor_pending",
        qty: 1,
        labor_hours: laborHours,
        parts_total: partsTotal,
        labor_total: laborTotal,
        subtotal,
        tax_total: finiteNumber(item.taxTotal),
        grand_total: grandTotal,
        metadata: metadata as Json,
        group_id: null,
        sent_to_customer_at: null,
        approved_at: null,
        declined_at: null,
      };

      rows.push(row);
      pendingSources.push(item);
    }

    let inserted: Array<{ id: string }> = [];
    if (rows.length > 0) {
      const { data, error } = await supabase
        .from("work_order_quote_lines")
        .insert(rows)
        .select("id");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      inserted = data ?? [];
      inserted.forEach((row, index) => {
        const source = pendingSources.find((item) => safeTrim(item.id) === row.id) ?? pendingSources[index];
        if (source) sourceItemsById.set(row.id, source);
        itemResults.push({
          requestedId: safeTrim(source?.id) || null,
          id: row.id,
          created: true,
          findingIdentity: source ? identityFor(source) : null,
        });
      });
    }

    for (const insertedRow of inserted) {
      const source = sourceItemsById.get(insertedRow.id);
      const parts = cleanParts(source?.parts);
      if (!source || parts.length === 0) continue;

      const sourceNote = safeTrim(source.notes) || safeTrim(source.complaint);
      const requestNotes = [
        sourceNote,
        `Quote line: ${insertedRow.id}`,
        source.sourceInspectionId ? `Inspection: ${source.sourceInspectionId}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const requestPayload: PartRequestInsert = {
        shop_id: wo.shop_id,
        work_order_id: workOrderId,
        job_id: null,
        requested_by: suggestedBy,
        notes: requestNotes || null,
        status: "requested",
      };

      const { data: partRequest, error: requestError } = await supabase
        .from("part_requests")
        .insert(requestPayload)
        .select("id")
        .single();

      if (requestError || !partRequest) {
        return NextResponse.json(
          { error: requestError?.message ?? "Failed to create part request" },
          { status: 500 },
        );
      }

      const partRows: PartRequestItemInsert[] = parts.map((part) => ({
        request_id: partRequest.id,
        shop_id: wo.shop_id,
        work_order_id: workOrderId,
        work_order_line_id: null,
        description: part.description,
        qty: part.qty,
        qty_requested: part.qty,
        unit_cost: part.unitCost,
        unit_price: part.unitPrice,
        status: "requested",
      }));

      const { error: itemError } = await supabase
        .from("part_request_items")
        .insert(partRows);

      if (itemError) {
        return NextResponse.json({ error: itemError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      ids: itemResults.map((item) => item.id),
      items: itemResults,
      createdCount: itemResults.filter((item) => item.created).length,
      skippedDuplicateCount: itemResults.filter((item) => !item.created).length,
      followUps: [
        "Add a database unique constraint for inspection finding identity when production data can be backfilled safely.",
        "Add quote_line_id linkage to part_request_items or part_requests so parts can relate to pre-approval quote lines without notes metadata.",
      ],
    });
  } catch (err) {
    console.error("[quotes/add] error:", err);
    return NextResponse.json(
      { error: "Failed to add quote items" },
      { status: 500 },
    );
  }
}
