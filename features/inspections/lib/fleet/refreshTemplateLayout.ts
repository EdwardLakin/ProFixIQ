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

export type TemplateLayoutRefresh = {
  sections: InspectionFormSection[];
  formContext: InspectionFormContext;
  gridPlan: ImportGridPlan;
  detection: DetectedImportGridPlan;
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
  treadUnit?: "32nds" | "mm" | null;
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
        tireGrid: detection.tireGrid,
        brakeGrid: detection.brakeGrid,
        brakeMode: detection.brakeMode,
      };
  const gridPlan: ImportGridPlan = { ...base, ...input.plan };

  const sections = applyImportGrids(input.sections, gridPlan, {
    vehicleType: input.vehicleType,
    treadUnit: input.treadUnit,
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
  if (detection.sourceHasTireMeasurements && gridPlan.tireGrid) {
    summary.push("Note: this form already has its own tire measurement rows, so the tire grid repeats them.");
  }
  if (detection.sourceHasBrakeMeasurements && gridPlan.brakeGrid) {
    summary.push("Note: this form already has its own brake measurement rows, so the brake grid repeats them.");
  }

  const changed =
    JSON.stringify(formContext) !== JSON.stringify(before) ||
    JSON.stringify(sections) !== JSON.stringify(input.sections);

  return { sections, formContext, gridPlan, detection, summary, changed };
}
