import { getServerSupabase } from "./supabase";

export type SmartMatchReadinessState =
  | "not_ready"
  | "ready_for_conservative"
  | "ready_for_full";

export type SourceRecord = {
  id: string;
  workOrderId?: string;
  label: string;
  href: string;
  createdAt?: string | null;
};

export type SmartMatchReadinessRecommendation = {
  state: SmartMatchReadinessState;
  summary: string;
  evidence: string[];
  reviewNotes: string[];
  nextAction?: string;
  stats: {
    completedRepairLines: number;
    repeatedComplaintCorrectionPatterns: number;
    linkedVehicleCount: number;
    importedHistoryCount: number;
    smartMatchEligibleHistoryCount: number;
    acceptedSmartMatchCount: number;
    dismissedSmartMatchCount: number;
  };
};

export type MenuItemEfficiencyRecommendation = {
  suggestedTitle: string;
  suggestedCategory: string;
  suggestedLaborHours: number | null;
  rationale: string;
  expectedOperationalBenefit: string;
  overlapCandidates: string[];
  evidenceBullets: string[];
  sourceRecords: SourceRecord[];
  explainabilityNotes: string[];
};

export type InspectionTemplateEfficiencyRecommendation = {
  suggestedTemplateTitle: string;
  suggestedScope: string;
  rationale: string;
  expectedOperationalBenefit: string;
  overlapCandidates: string[];
  evidenceBullets: string[];
  sourceRecords: SourceRecord[];
  explainabilityNotes: string[];
};

function norm(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isCompletedStatus(value: string | null | undefined): boolean {
  const v = (value ?? "").toLowerCase();
  return ["completed", "complete", "closed", "invoiced", "done", "delivered"].some((token) =>
    v.includes(token),
  );
}

function isInspectionLike(value: string): boolean {
  return [
    "inspection",
    "inspect",
    "mpi",
    "multi point",
    "multi-point",
    "check",
    "checklist",
    "diag",
    "diagnostic",
    "courtesy",
    "safety",
  ].some((token) => value.includes(token));
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function evaluateSmartMatchReadiness(
  shopId: string,
): Promise<SmartMatchReadinessRecommendation> {
  const supabase = getServerSupabase();

  const { data: woRows, error: woErr } = await supabase
    .from("work_orders")
    .select("id, status, vehicle_id")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(800);

  if (woErr) {
    throw new Error(woErr.message || "Failed to load work orders for Smart Match readiness");
  }

  const completedWorkOrders = (woRows ?? []).filter((row) => isCompletedStatus(row.status));
  const completedWorkOrderIds = completedWorkOrders.map((row) => row.id);

  const { data: lineRows, error: lineErr } = completedWorkOrderIds.length
    ? await supabase
        .from("work_order_lines")
        .select(
          "id, work_order_id, vehicle_id, menu_item_id, complaint, correction, description, source_row_id, source_intake_id, external_id",
        )
        .in("work_order_id", completedWorkOrderIds.slice(0, 700))
        .limit(1500)
    : { data: [], error: null };

  if (lineErr) {
    throw new Error(lineErr.message || "Failed to load work order lines for Smart Match readiness");
  }

  const { data: feedbackRows, error: feedbackErr } = await supabase
    .from("inspection_smart_match_feedback")
    .select("action")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(400);

  if (feedbackErr) {
    throw new Error(feedbackErr.message || "Failed to load Smart Match feedback");
  }

  const lines = lineRows ?? [];
  const completedRepairLines = lines.length;

  const patternCounts = new Map<string, number>();
  for (const row of lines) {
    const complaint = norm(row.complaint);
    const correction = norm(row.correction ?? row.description);
    if (!complaint || !correction) continue;
    const key = `${complaint} -> ${correction}`;
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
  }

  const repeatedComplaintCorrectionPatterns = [...patternCounts.values()].filter((count) => count >= 3).length;
  const linkedVehicleCount = new Set(completedWorkOrders.map((row) => row.vehicle_id).filter(Boolean)).size;
  const importedHistoryCount = lines.filter((row) => row.source_row_id || row.source_intake_id || row.external_id).length;
  const smartMatchEligibleHistoryCount = lines.filter((row) => row.menu_item_id || row.correction || row.description).length;

  const acceptedSmartMatchCount = (feedbackRows ?? []).filter((row) => row.action === "accepted").length;
  const dismissedSmartMatchCount = (feedbackRows ?? []).filter((row) => row.action === "dismissed").length;

  const score =
    (completedRepairLines >= 220 ? 2 : completedRepairLines >= 120 ? 1 : 0) +
    (repeatedComplaintCorrectionPatterns >= 20 ? 2 : repeatedComplaintCorrectionPatterns >= 8 ? 1 : 0) +
    (linkedVehicleCount >= 40 ? 2 : linkedVehicleCount >= 18 ? 1 : 0) +
    (importedHistoryCount >= 80 ? 1 : 0) +
    (smartMatchEligibleHistoryCount >= 130 ? 1 : 0) +
    (acceptedSmartMatchCount >= 20 && dismissedSmartMatchCount <= acceptedSmartMatchCount * 0.4 ? 1 : 0);

  const state: SmartMatchReadinessState =
    score >= 7 ? "ready_for_full" : score >= 4 ? "ready_for_conservative" : "not_ready";

  const summary =
    state === "ready_for_full"
      ? "Smart Match is ready for Full mode based on stable repeated repair patterns and cross-vehicle history."
      : state === "ready_for_conservative"
        ? "Smart Match is ready for Conservative mode based on meaningful repair history and repeated complaint/correction patterns."
        : "Smart Match is not ready yet because the shop's usable repair history is still sparse for reliable matching.";

  const evidence = [
    `${completedRepairLines} completed repair line(s) sampled from recent closed/completed work orders.`,
    `${repeatedComplaintCorrectionPatterns} repeated complaint→correction pattern cluster(s) met the minimum frequency threshold.`,
    `${linkedVehicleCount} distinct vehicle(s) contribute to historical pattern coverage.`,
    `${importedHistoryCount} line(s) include imported/source history indicators (external or mapped source references).`,
    `${smartMatchEligibleHistoryCount} line(s) include signals useful for Smart Match eligibility.`,
    `Feedback sample: ${acceptedSmartMatchCount} accepted and ${dismissedSmartMatchCount} dismissed Smart Match feedback event(s).`,
  ];

  return {
    state,
    summary,
    evidence,
    reviewNotes: [
      "Recommendation only: Smart Match mode is not auto-enabled by this evaluator.",
      "Owner/admin should review false-positive risk and sample matched recommendations before changing mode.",
    ],
    nextAction:
      state === "not_ready"
        ? "Keep Smart Match off, continue collecting completed repair lines, and re-run readiness after more repeated patterns accumulate."
        : state === "ready_for_conservative"
          ? "Enable Conservative mode only after owner/admin review and monitor accepted vs dismissed feedback weekly."
          : "Consider enabling Full mode after owner/admin review and continue auditing weak-match dismissals.",
    stats: {
      completedRepairLines,
      repeatedComplaintCorrectionPatterns,
      linkedVehicleCount,
      importedHistoryCount,
      smartMatchEligibleHistoryCount,
      acceptedSmartMatchCount,
      dismissedSmartMatchCount,
    },
  };
}

export async function buildMenuItemEfficiencyRecommendations(
  shopId: string,
): Promise<MenuItemEfficiencyRecommendation[]> {
  const supabase = getServerSupabase();

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString();
  const [menuRes, woRes, linesRes] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name, category")
      .eq("shop_id", shopId)
      .limit(250),
    supabase
      .from("work_orders")
      .select("id, status")
      .eq("shop_id", shopId)
      .gte("created_at", since)
      .limit(900),
    supabase
      .from("work_order_lines")
      .select("id, work_order_id, description, complaint, correction, labor_time, menu_item_id, created_at")
      .eq("shop_id", shopId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1800),
  ]);

  if (menuRes.error || woRes.error || linesRes.error) {
    throw new Error(
      menuRes.error?.message ?? woRes.error?.message ?? linesRes.error?.message ?? "Failed to build menu item efficiency recommendations",
    );
  }

  const completedIds = new Set((woRes.data ?? []).filter((row) => isCompletedStatus(row.status)).map((row) => row.id));

  const clusters = new Map<
    string,
    {
      count: number;
      labor: number[];
      complaints: Set<string>;
      corrections: Set<string>;
      sourceRecords: SourceRecord[];
      distinctWorkOrders: Set<string>;
    }
  >();

  for (const row of linesRes.data ?? []) {
    if (!row.work_order_id || !completedIds.has(row.work_order_id)) continue;
    if (row.menu_item_id) continue;

    const lineText = norm(row.description || row.complaint || row.correction);
    if (lineText.length < 8) continue;

    const key = lineText;
    const current =
      clusters.get(key) ??
      {
        count: 0,
        labor: [],
        complaints: new Set<string>(),
        corrections: new Set<string>(),
        sourceRecords: [],
        distinctWorkOrders: new Set<string>(),
      };

    current.count += 1;
    current.distinctWorkOrders.add(row.work_order_id);
    if (typeof row.labor_time === "number") current.labor.push(row.labor_time);

    const complaint = norm(row.complaint);
    const correction = norm(row.correction);
    if (complaint) current.complaints.add(complaint);
    if (correction) current.corrections.add(correction);

    if (current.sourceRecords.length < 7) {
      current.sourceRecords.push({
        id: row.id,
        workOrderId: row.work_order_id,
        label: row.description ?? row.complaint ?? "Repeated manual line",
        href: `/work-orders/${row.work_order_id}`,
        createdAt: row.created_at,
      });
    }

    clusters.set(key, current);
  }

  const menuItems = menuRes.data ?? [];

  return [...clusters.entries()]
    .filter(([, cluster]) => cluster.count >= 5 && cluster.distinctWorkOrders.size >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4)
    .map(([key, cluster]) => {
      const title = titleCase(key).slice(0, 70);
      const overlapCandidates = menuItems
        .filter((item) => norm(item.name).includes(key.slice(0, 20)) || key.includes(norm(item.name)))
        .slice(0, 4)
        .map((item) => item.name ?? item.id);
      const suggestedLaborHours = avg(cluster.labor);

      return {
        suggestedTitle: title,
        suggestedCategory:
          overlapCandidates.length > 0
            ? menuItems.find((item) => (item.name ?? "") === overlapCandidates[0])?.category ?? "General Repair"
            : "General Repair",
        suggestedLaborHours,
        rationale: `This work pattern repeated ${cluster.count} time(s) across ${cluster.distinctWorkOrders.size} completed work order(s) and is currently being entered manually instead of selected from menu_items.`,
        expectedOperationalBenefit:
          "Reduces repeated manual entry, improves quote consistency, and speeds advisor workflow.",
        overlapCandidates,
        evidenceBullets: [
          `${cluster.count} repeated manual line(s) in the last 90 days.`,
          `${cluster.complaints.size} unique complaint phrasing cluster(s) and ${cluster.corrections.size} correction cluster(s).`,
          suggestedLaborHours != null
            ? `Observed labor baseline averages ${suggestedLaborHours.toFixed(1)} hour(s).`
            : "Labor baseline could not be derived from recent lines; advisor review required.",
        ],
        sourceRecords: cluster.sourceRecords,
        explainabilityNotes: [
          "Deterministic clustering used normalized line text and completed-work-only evidence.",
          "No menu_items record was created automatically.",
        ],
      } satisfies MenuItemEfficiencyRecommendation;
    });
}

export async function buildInspectionTemplateEfficiencyRecommendations(
  shopId: string,
): Promise<InspectionTemplateEfficiencyRecommendation[]> {
  const supabase = getServerSupabase();
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString();

  const [woRes, templateRes, linesRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, status")
      .eq("shop_id", shopId)
      .gte("created_at", since)
      .limit(900),
    supabase
      .from("inspection_templates")
      .select("id, template_name")
      .eq("shop_id", shopId)
      .limit(250),
    supabase
      .from("work_order_lines")
      .select("id, work_order_id, description, complaint, inspection_template_id, created_at")
      .eq("shop_id", shopId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1800),
  ]);

  if (woRes.error || templateRes.error || linesRes.error) {
    throw new Error(
      woRes.error?.message ?? templateRes.error?.message ?? linesRes.error?.message ?? "Failed to build inspection template efficiency recommendations",
    );
  }

  const completedIds = new Set((woRes.data ?? []).filter((row) => isCompletedStatus(row.status)).map((row) => row.id));

  const clusters = new Map<
    string,
    {
      count: number;
      sections: Map<string, number>;
      sourceRecords: SourceRecord[];
      distinctWorkOrders: Set<string>;
    }
  >();

  for (const row of linesRes.data ?? []) {
    if (!row.work_order_id || !completedIds.has(row.work_order_id)) continue;
    if (row.inspection_template_id) continue;

    const candidate = norm(row.description || row.complaint);
    if (!candidate || !isInspectionLike(candidate)) continue;

    const key = candidate;
    const current =
      clusters.get(key) ??
      {
        count: 0,
        sections: new Map<string, number>(),
        sourceRecords: [],
        distinctWorkOrders: new Set<string>(),
      };

    current.count += 1;
    current.distinctWorkOrders.add(row.work_order_id);

    const sectionGuess =
      candidate.includes("brake")
        ? "Brakes"
        : candidate.includes("suspension")
          ? "Suspension"
          : candidate.includes("engine")
            ? "Engine"
            : candidate.includes("cool")
              ? "Cooling"
              : "General Inspection";
    current.sections.set(sectionGuess, (current.sections.get(sectionGuess) ?? 0) + 1);

    if (current.sourceRecords.length < 7) {
      current.sourceRecords.push({
        id: row.id,
        workOrderId: row.work_order_id,
        label: row.description ?? row.complaint ?? "Repeated manual inspection line",
        href: `/work-orders/${row.work_order_id}`,
        createdAt: row.created_at,
      });
    }

    clusters.set(key, current);
  }

  const templates = templateRes.data ?? [];

  return [...clusters.entries()]
    .filter(([, cluster]) => cluster.count >= 4 && cluster.distinctWorkOrders.size >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4)
    .map(([key, cluster]) => {
      const suggestedTemplateTitle = `${titleCase(key).slice(0, 48)} Inspection`;
      const overlapCandidates = templates
        .filter((template) => norm(template.template_name).includes(key.slice(0, 18)) || key.includes(norm(template.template_name)))
        .slice(0, 4)
        .map((template) => template.template_name ?? template.id);

      const topSections = [...cluster.sections.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => `${name} (${count})`);

      return {
        suggestedTemplateTitle,
        suggestedScope: topSections.length > 0 ? topSections.join(" • ") : "General inspection workflow",
        rationale: `Inspection-like manual work was repeated ${cluster.count} time(s) across ${cluster.distinctWorkOrders.size} completed work order(s) without template backing.`,
        expectedOperationalBenefit:
          "Standardizes technician documentation and reduces repeated manual inspection setup.",
        overlapCandidates,
        evidenceBullets: [
          `${cluster.count} repeated inspection-like manual line(s) in the sampled history.`,
          `${cluster.distinctWorkOrders.size} distinct work order(s) show the same inspection behavior pattern.`,
          topSections.length > 0
            ? `Likely recurring section focus: ${topSections.join(", ")}.`
            : "Section-level inspection patterning was limited in this sample.",
        ],
        sourceRecords: cluster.sourceRecords,
        explainabilityNotes: [
          "Deterministic pattern detection was used; recommendations are evidence-backed and review-first.",
          "No inspection_templates record was created automatically.",
        ],
      } satisfies InspectionTemplateEfficiencyRecommendation;
    });
}
