// Brings an already-saved imported template up to the current import layout
// without re-reading the paper form: the printed certificate moves to the end,
// OCR noise is dropped, and the tire / brake grids that fit the form are
// added. Pure, so the editor can preview exactly what it will change.

import {
  emptyInspectionFormContext,
  INSPECTION_FORM_CONTEXT_BLOCKS,
  refineInspectionFormContext,
  type ImportGridPlan,
  type InspectionFormContext,
  type InspectionFormSection,
} from "@/features/inspections/lib/form-import";
import {
  applyImportGrids,
  currentImportGridPlan,
  detectImportGridPlan,
  isImportGridSection,
  type DetectedImportGridPlan,
} from "@/features/inspections/lib/fleet/importGrids";

/**
 * A reviewer's explicit "no" to a grid the form calls for. Saved as template
 * tags, because the absence of a generated grid section cannot tell "declined"
 * from "never offered": without it, reopening a template that deliberately has
 * no grids would offer them again, forever.
 */
export const DECLINED_GRID_TAGS = {
  tireGrid: "layout:no-tire-grid",
  brakeGrid: "layout:no-brake-grid",
} as const;

export type DeclinedGrids = { tireGrid: boolean; brakeGrid: boolean };

export function declinedGridsFromTags(
  tags: readonly string[] | null | undefined,
): DeclinedGrids {
  const have = new Set((tags ?? []).map((t) => t.toLowerCase()));
  return {
    tireGrid: have.has(DECLINED_GRID_TAGS.tireGrid),
    brakeGrid: have.has(DECLINED_GRID_TAGS.brakeGrid),
  };
}

/** The template's tags with the layout tags replaced; other tags untouched. */
export function tagsWithDeclinedGrids(
  tags: readonly string[] | null | undefined,
  declined: DeclinedGrids,
): string[] {
  const layout = new Set<string>(Object.values(DECLINED_GRID_TAGS));
  const kept = (tags ?? []).filter((t) => !layout.has(t.toLowerCase()));
  if (declined.tireGrid) kept.push(DECLINED_GRID_TAGS.tireGrid);
  if (declined.brakeGrid) kept.push(DECLINED_GRID_TAGS.brakeGrid);
  return kept;
}

/**
 * The tread unit the template's own generated tire grid already uses, so a
 * refresh that leaves the unit selector alone does not quietly relabel saved
 * measurements.
 */
function existingTreadUnit(
  sections: readonly InspectionFormSection[],
): "32nds" | "mm" | null {
  const units = sections
    .filter((s) => s.generatedGrid?.kind === "tire")
    .flatMap((s) => s.items)
    .filter((item) => /tread/i.test(item.item))
    .map((item) => (item.unit ?? "").toLowerCase());
  if (units.length === 0) return null;
  if (units.every((u) => u === "32nds")) return "32nds";
  if (units.every((u) => u === "mm")) return "mm";
  return null;
}

export type TemplateLayoutRefresh = {
  sections: InspectionFormSection[];
  formContext: InspectionFormContext;
  gridPlan: ImportGridPlan;
  detection: DetectedImportGridPlan;
  /** Grids the form calls for that the reviewer has turned off. */
  declined: DeclinedGrids;
  /** Plain-language list of what applying this will change. */
  summary: string[];
  changed: boolean;
};

function labels(context: InspectionFormContext, block: keyof InspectionFormContext) {
  return context[block].flatMap((section) => section.items.map((item) => item.item));
}

function totalItems(context: InspectionFormContext): number {
  return INSPECTION_FORM_CONTEXT_BLOCKS.reduce(
    (sum, block) => sum + labels(context, block).length,
    0,
  );
}

export function refreshTemplateLayout(input: {
  sections: readonly InspectionFormSection[];
  formContext?: InspectionFormContext | null;
  vehicleType?: string | null;
  title?: string | null;
  /** Reviewer's choices; anything left out follows the template or the form. */
  plan?: Partial<ImportGridPlan>;
  /** Left unset, the template's existing tread unit is kept. */
  treadUnit?: "32nds" | "mm" | null;
  /** Earlier explicit "no grid" choices (see DECLINED_GRID_TAGS). */
  declined?: Partial<DeclinedGrids>;
}): TemplateLayoutRefresh {
  const before = input.formContext ?? emptyInspectionFormContext();
  const formContext = refineInspectionFormContext(before);

  const detection = detectImportGridPlan({
    sections: input.sections,
    vehicleType: input.vehicleType,
    title: input.title,
  });

  // A template that already has generated grids keeps its own choices; one
  // that has none gets what the form calls for. The reviewer can override.
  const hasGeneratedGrids = input.sections.some(isImportGridSection);
  const base: ImportGridPlan = hasGeneratedGrids
    ? currentImportGridPlan(input.sections, detection.brakeMode)
    : {
        tireGrid: detection.tireGrid && !input.declined?.tireGrid,
        brakeGrid: detection.brakeGrid && !input.declined?.brakeGrid,
        batteryGrid: false,
        brakeMode: detection.brakeMode,
      };
  const gridPlan: ImportGridPlan = { ...base, ...input.plan };
  const declined: DeclinedGrids = {
    tireGrid: detection.tireGrid && !gridPlan.tireGrid,
    brakeGrid: detection.brakeGrid && !gridPlan.brakeGrid,
  };

  const sections = applyImportGrids(input.sections, gridPlan, {
    vehicleType: input.vehicleType,
    treadUnit: input.treadUnit ?? existingTreadUnit(input.sections),
  });

  const summary: string[] = [];

  const movedToEnd = labels(formContext, "completion").filter(
    (label) => !labels(before, "completion").includes(label),
  );
  if (movedToEnd.length) {
    summary.push(
      `Move ${movedToEnd.length} certificate field${movedToEnd.length === 1 ? "" : "s"} to the end, above the signature block (${movedToEnd.join(", ")}).`,
    );
  }
  const removed = totalItems(before) - totalItems(formContext);
  if (removed > 0) {
    summary.push(
      `Remove ${removed} page marker / legend / table-heading row${removed === 1 ? "" : "s"} that were never fields.`,
    );
  }
  const newBranding = labels(formContext, "branding").filter(
    (label) => !labels(before, "branding").includes(label),
  );
  if (newBranding.length) {
    summary.push(`Treat ${newBranding.join(", ")} as form branding.`);
  }

  const hadTire = input.sections.some((s) => s.generatedGrid?.kind === "tire");
  const hadBrake = input.sections.some((s) => s.generatedGrid?.kind === "brake");
  const before_mode = input.sections.find((s) => s.generatedGrid)?.generatedGrid
    ?.brakeMode;
  const modeChanged = Boolean(before_mode) && before_mode !== gridPlan.brakeMode;
  const describe = (kind: string) =>
    `${kind} (${gridPlan.brakeMode === "air" ? "air brakes" : "hydraulic brakes"})`;
  if (gridPlan.tireGrid && (!hadTire || modeChanged)) summary.push(`Add the ${describe("tire grid")}.`);
  if (gridPlan.brakeGrid && (!hadBrake || modeChanged)) summary.push(`Add the ${describe("brake corner grid")}.`);
  if (!gridPlan.tireGrid && hadTire) summary.push("Remove the tire grid.");
  if (!gridPlan.brakeGrid && hadBrake) summary.push("Remove the brake corner grid.");
  const hadBattery = input.sections.some((s) => s.generatedGrid?.kind === "battery");
  if (gridPlan.batteryGrid && !hadBattery) summary.push("Add the battery grid (rated / tested CCA).");
  if (!gridPlan.batteryGrid && hadBattery) summary.push("Remove the battery grid.");

  const keptTitles = new Set(sections.map((s) => s.title));
  const replaced = input.sections
    .filter((s) => !isImportGridSection(s) && !keptTitles.has(s.title))
    .map((s) => s.title);
  if (replaced.length) {
    summary.push(
      `Remove the form's own measurement table${replaced.length === 1 ? "" : "s"} the grids replace (${replaced.join(", ")}).`,
    );
  }

  const gridTitles = (list: readonly InspectionFormSection[]) =>
    list.filter(isImportGridSection).map((s) => s.title);
  const gridsBefore = input.sections.findIndex(isImportGridSection);
  if (
    gridsBefore > 0 &&
    JSON.stringify(gridTitles(input.sections)) === JSON.stringify(gridTitles(sections))
  ) {
    summary.push("Move the grids to the top of the checklist.");
  }

  const changed =
    JSON.stringify(formContext) !== JSON.stringify(before) ||
    JSON.stringify(sections) !== JSON.stringify(input.sections);

  return { sections, formContext, gridPlan, detection, declined, summary, changed };
}
