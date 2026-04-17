import type { CanonicalPartSuggestion, PartFitmentConfidence, PartSuggestionEvidence, PartSuggestionWarning } from "@/features/parts/types/partSuggestions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

type BuildArgs = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseLike;
  shopId: string;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  vehicle?: { year?: string | number | null; make?: string | null; model?: string | null } | null;
  description?: string | null;
  notes?: string | null;
  topK?: number;
};

function tokens(input: string): string[] {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((v) => v.trim())
        .filter((v) => v.length >= 3),
    ),
  ).slice(0, 12);
}

function fitmentFromSignals(args: {
  sameVehicle: number;
  sameYmm: number;
  complaintMatches: number;
  warnings: PartSuggestionWarning[];
}): PartFitmentConfidence {
  if (args.warnings.some((w) => w.type === "fitment_uncertain")) return "needs_review";
  if (args.sameVehicle >= 2 && args.complaintMatches > 0) return "confirmed_fit";
  if (args.sameVehicle > 0 || args.sameYmm > 1) return "likely_fit";
  return "unknown_fit";
}

function clampQty(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 1;
  return Math.min(10, Math.round(value));
}

export async function buildPartSuggestions(args: BuildArgs): Promise<CanonicalPartSuggestion[]> {
  const topK = Math.min(10, Math.max(1, args.topK ?? 5));
  const queryText = `${args.description ?? ""} ${args.notes ?? ""}`.trim();
    const [partsRes, stockRes, woPartsRes, requestItemRes, lineRes, woRes] = await Promise.all([
    args.supabase
      .from("parts")
      .select("id, name, sku, default_cost, supplier_id, category")
      .eq("shop_id", args.shopId)
      .limit(250),
    args.supabase
      .from("part_stock")
      .select("part_id, qty_on_hand, reorder_point")
      .eq("shop_id", args.shopId)
      .limit(500),
    args.supabase
      .from("work_order_parts")
      .select("id, work_order_id, part_id, part_name, part_number, quantity, created_at, work_orders!inner(id, shop_id, vehicle_id, complaint, description)")
      .eq("work_orders.shop_id", args.shopId)
      .order("created_at", { ascending: false })
      .limit(700),
    args.supabase
      .from("part_request_items")
      .select("id, part_id, description, qty_approved, qty_received, work_order_id, po_id")
      .eq("shop_id", args.shopId)
      .limit(500),
    args.workOrderLineId
      ? args.supabase
          .from("work_order_lines")
          .select("id, work_order_id, complaint, description, notes")
          .eq("id", args.workOrderLineId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    args.workOrderId
      ? args.supabase
          .from("work_orders")
          .select("id, vehicle_id")
          .eq("id", args.workOrderId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const error = partsRes.error ?? stockRes.error ?? woPartsRes.error ?? requestItemRes.error ?? lineRes.error ?? woRes.error;
  if (error) throw new Error(error.message || "Failed to build part suggestions");

  const lineData = (lineRes.data ?? null) as { description?: string | null; complaint?: string | null; notes?: string | null } | null;
  const lineText = `${lineData?.description ?? ""} ${lineData?.complaint ?? ""} ${lineData?.notes ?? ""}`.trim();
  const allTokens = tokens(`${queryText} ${lineText}`);

  const parts = (partsRes.data ?? []) as Array<{ id: string; name: string | null; sku: string | null; default_cost: number | null; supplier_id: string | null; category: string | null }>;
  const stockByPart = new Map<string, { qty_on_hand: number; reorder_point: number | null }>();
  for (const row of (stockRes.data ?? []) as Array<{ part_id: string; qty_on_hand: number | null; reorder_point: number | null }>) {
    stockByPart.set(row.part_id, { qty_on_hand: Number(row.qty_on_hand ?? 0), reorder_point: row.reorder_point });
  }

  const currentVehicleId = (woRes.data as { vehicle_id?: string | null } | null)?.vehicle_id ?? null;
  const rows = (woPartsRes.data ?? []) as Array<{
    work_order_id: string | null;
    part_id: string | null;
    part_name: string | null;
    part_number: string | null;
    quantity: number | null;
    work_orders?: { id: string; shop_id: string; vehicle_id: string | null; complaint: string | null; description: string | null } | null;
  }>;

  const currentWoPartIds = new Set(
    rows.filter((r) => r.work_order_id === args.workOrderId && r.part_id).map((r) => String(r.part_id)),
  );

  const requestItems = (requestItemRes.data ?? []) as Array<{
    id: string;
    part_id: string | null;
    description: string | null;
    qty_approved: number | null;
    qty_received: number | null;
    work_order_id: string | null;
    po_id: string | null;
  }>;

  const candidateMap = new Map<string, CanonicalPartSuggestion>();

  for (const part of parts) {
    const title = (part.name ?? part.sku ?? part.id).trim();
    const haystack = `${part.name ?? ""} ${part.sku ?? ""} ${part.category ?? ""}`.toLowerCase();
    const complaintHitCount = allTokens.filter((t) => haystack.includes(t)).length;
    if (complaintHitCount === 0 && allTokens.length > 0) continue;

    const sameVehicleRows = rows.filter((r) => r.part_id === part.id && r.work_orders?.vehicle_id && currentVehicleId && r.work_orders.vehicle_id === currentVehicleId && r.work_order_id !== args.workOrderId);
    const sameYmmRows = rows.filter((r) => r.part_id === part.id && r.work_order_id !== args.workOrderId).slice(0, 15);
    const similarComplaintRows = rows.filter((r) => r.part_id === part.id && allTokens.some((t) => `${r.work_orders?.complaint ?? ""} ${r.work_orders?.description ?? ""}`.toLowerCase().includes(t)));

    const stock = stockByPart.get(part.id);
    const warnings: PartSuggestionWarning[] = [];
    if (currentWoPartIds.has(part.id)) {
      warnings.push({ type: "duplicate_on_work_order", message: "This part is already on the current work order." });
    }

    const reqForPart = requestItems.filter((r) => r.part_id === part.id && r.work_order_id === args.workOrderId);
    if (reqForPart.length > 0) {
      warnings.push({ type: "existing_part_request", message: "There is already a parts request for this item on this job." });
    }

    const openPoRows = requestItems.filter((r) => r.part_id === part.id && r.po_id && (r.qty_approved ?? 0) > (r.qty_received ?? 0));
    if (openPoRows.length > 0) {
      warnings.push({ type: "open_po_overlap", message: "Open PO/receiving quantity already exists for this part." });
    }

    if (sameVehicleRows.length === 0 && sameYmmRows.length === 0) {
      warnings.push({ type: "fitment_uncertain", message: "No strong fitment history found. Review fitment before add/request." });
    }

    const evidence: PartSuggestionEvidence[] = [];
    if (sameVehicleRows.length > 0) {
      evidence.push({
        id: `${part.id}:sameVehicle`,
        sourceType: "same_vehicle_history",
        label: "Used on same vehicle",
        detail: `${sameVehicleRows.length} prior usage record(s) on this exact vehicle.`,
        href: sameVehicleRows[0]?.work_order_id ? `/work-orders/${sameVehicleRows[0].work_order_id}` : undefined,
        strength: "strong",
      });
    }
    if (sameYmmRows.length > 0) {
      evidence.push({
        id: `${part.id}:sameYmm`,
        sourceType: "same_ymm_history",
        label: "Used on same YMM",
        detail: `${sameYmmRows.length} prior usage record(s) on similar vehicles.`,
        href: sameYmmRows[0]?.work_order_id ? `/work-orders/${sameYmmRows[0].work_order_id}` : undefined,
        strength: "moderate",
      });
    }
    if (complaintHitCount > 0 || similarComplaintRows.length > 0) {
      evidence.push({
        id: `${part.id}:complaint`,
        sourceType: "complaint_match",
        label: "Complaint match",
        detail: `${Math.max(complaintHitCount, similarComplaintRows.length)} complaint token match signal(s).`,
        strength: "moderate",
      });
    }
    if (stock) {
      evidence.push({
        id: `${part.id}:stock`,
        sourceType: "inventory_candidate",
        label: "Inventory candidate",
        detail: `On hand ${stock.qty_on_hand}${stock.reorder_point != null ? `, reorder point ${stock.reorder_point}` : ""}.`,
        href: `/parts/inventory?part=${part.id}`,
        strength: "moderate",
      });
    }
    if (openPoRows.length > 0) {
      evidence.push({
        id: `${part.id}:po`,
        sourceType: "receiving_or_open_po",
        label: "Open receiving/PO",
        detail: `${openPoRows.length} request item(s) still pending receive on open PO(s).`,
        href: "/parts/receive",
        strength: "weak",
      });
    }

    const fitmentConfidence = fitmentFromSignals({
      sameVehicle: sameVehicleRows.length,
      sameYmm: sameYmmRows.length,
      complaintMatches: complaintHitCount,
      warnings,
    });

    const rankScore =
      sameVehicleRows.length * 40 +
      sameYmmRows.length * 12 +
      complaintHitCount * 14 +
      (stock?.qty_on_hand != null ? Math.min(15, stock.qty_on_hand) : 0) -
      warnings.length * 8;

    candidateMap.set(part.id, {
      candidateId: part.id,
      partId: part.id,
      sku: part.sku,
      supplierId: part.supplier_id,
      title,
      quantitySuggestion: clampQty(sameVehicleRows[0]?.quantity ?? 1),
      unit: "each",
      unitPrice: part.default_cost,
      sourceTypes: evidence.map((e) => e.sourceType),
      fitmentConfidence,
      historySignal: {
        sameVehicleCount: sameVehicleRows.length,
        sameYmmCount: sameYmmRows.length,
        similarComplaintCount: similarComplaintRows.length,
        summary:
          sameVehicleRows.length > 0
            ? "used_on_same_vehicle"
            : sameYmmRows.length > 0
              ? "used_on_same_ymm"
              : similarComplaintRows.length > 0
                ? "used_for_similar_complaint"
                : "no_prior_usage_found",
      },
      inventorySignal: {
        inStockQty: stock ? stock.qty_on_hand : null,
        lowStock: stock ? (stock.reorder_point != null ? stock.qty_on_hand <= stock.reorder_point : stock.qty_on_hand <= 0) : false,
        reorderPoint: stock?.reorder_point ?? null,
      },
      receivingSignal: {
        openRequestQty: reqForPart.reduce((sum, r) => sum + Number(r.qty_approved ?? 0), 0),
        pendingReceiveQty: reqForPart.reduce((sum, r) => sum + Math.max(0, Number(r.qty_approved ?? 0) - Number(r.qty_received ?? 0)), 0),
        openPoCount: openPoRows.length,
      },
      warnings,
      linkedEvidence: evidence,
      reviewRecommendation:
        fitmentConfidence === "confirmed_fit"
          ? "Review duplicates, then safe to add with standard verification."
          : "Review fitment and duplicate/conflict checks before add or request.",
      addable: !warnings.some((w) => w.type === "duplicate_on_work_order"),
      requestable: !warnings.some((w) => w.type === "existing_part_request"),
      rankScore,
    });
  }

  const ordered = Array.from(candidateMap.values()).sort((a, b) => b.rankScore - a.rankScore);

  const top = ordered.slice(0, topK);
  if (top.length > 1) {
    const topTokens = new Map<string, number>();
    for (const row of top) {
      for (const t of tokens(row.title)) topTokens.set(t, (topTokens.get(t) ?? 0) + 1);
    }
    for (const row of top) {
      const overlaps = tokens(row.title).filter((t) => (topTokens.get(t) ?? 0) > 1).length;
      if (overlaps >= 2) {
        row.warnings.push({ type: "conflicting_alternative", message: "Multiple similar alternatives detected. Pick one after review." });
      }
    }
  }

  return top;
}
