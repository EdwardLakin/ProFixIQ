// Tire and brake grids for an imported fleet form.
//
// A paper form's measurement tables rarely survive OCR as rows, and ProFixIQ's
// own grids (single/dual tires per axle, pads/linings, push-rod travel) are
// how every other inspection captures those readings, including by voice. So
// each import is offered the grid that fits its vehicle and brake system, as
// real sections the technician can remove on the review screen. They are
// added at import time and saved with the template, which keeps the runtime
// rule that an imported form is never reshaped on the fly.

import { masterInspectionList } from "@/features/inspections/lib/inspection/masterInspectionList";
import {
  buildAirCornerSection,
  buildHydraulicCornerSection,
} from "@/features/inspections/lib/inspection/prepareSectionsWithCornerGrid";
import type {
  GeneratedGridMeta,
  ImportGridPlan,
  InspectionFormItem,
  InspectionFormSection,
} from "@/features/inspections/lib/form-import";

export type { ImportGridPlan };
export type BrakeMode = ImportGridPlan["brakeMode"];

export type DetectedImportGridPlan = ImportGridPlan & {
  /** The source form already measures this itself; no second grid is added. */
  sourceHasTireMeasurements: boolean;
  sourceHasBrakeMeasurements: boolean;
  /** Plain-language reasons shown to the reviewer. */
  reasons: string[];
};

const TIRE_GRID_AIR_TITLE = "Tire Grid — Air Brake (HD)";
const TIRE_GRID_HYD_TITLE = "Tire Grid — Hydraulic";

/**
 * True for a section this module generated. Identity is the saved
 * `generatedGrid` marker, never the title: a reviewer can rename a generated
 * grid, and a customer's own section may share a canonical title.
 */
export function isImportGridSection(section: {
  generatedGrid?: GeneratedGridMeta;
}): boolean {
  return Boolean(section.generatedGrid);
}

// Brake-system evidence only. "Air suspension" is not a brake system, and a
// hydraulic-brake form can perfectly well list it.
const AIR_SIGNAL_RE =
  /\bair\s*brakes?\b|brake chambers?|slack adjusters?|push\s*rods?|pushrod|tractor protection|spring brake|\bair\s*(?:tanks?|dryer)\b|air system leak/gi;
const HYD_SIGNAL_RE =
  /\bhydraulic\s*brakes?\b|\bhydraulic\b|brake fluid|master cylinder|calipers?|brake booster/gi;

function countMatches(re: RegExp, text: string): number {
  return (text.match(re) ?? []).length;
}

const TIRE_MEASURE_RE = /tread depth|tire pressure|tyre pressure|\bpsi\b/i;
const BRAKE_MEASURE_RE =
  /lining|shoe|\bpads?\b|rotor|\bdrum\b|push\s*rod|pushrod/i;

type Row = Pick<InspectionFormItem, "item" | "fieldType">;

function rows(sections: readonly InspectionFormSection[]): Row[] {
  return sections.flatMap((section) => section.items ?? []);
}

function measurementRows(sections: readonly InspectionFormSection[]): Row[] {
  return rows(sections).filter((row) => row.fieldType === "measurement");
}

export function detectImportGridPlan(input: {
  sections: readonly InspectionFormSection[];
  vehicleType?: string | null;
  dutyClass?: string | null;
  title?: string | null;
  extractedText?: string | null;
}): DetectedImportGridPlan {
  // Grids this module added earlier do not count as the source's own.
  const source = input.sections.filter((section) => !isImportGridSection(section));
  const reasons: string[] = [];

  const corpus = [
    input.title ?? "",
    input.extractedText ?? "",
    ...source.map((section) => section.title),
    ...rows(source).map((row) => row.item),
  ].join("\n");

  const vehicleType = (input.vehicleType ?? "").toLowerCase();
  const dutyClass = (input.dutyClass ?? "").toLowerCase();

  const airHits = countMatches(AIR_SIGNAL_RE, corpus);
  const hydHits = countMatches(HYD_SIGNAL_RE, corpus);

  let brakeMode: BrakeMode;
  if (airHits > 0 && hydHits === 0) {
    brakeMode = "air";
    reasons.push("The form mentions air-brake components.");
  } else if (hydHits > 0 && airHits === 0) {
    brakeMode = "hydraulic";
    reasons.push("The form mentions hydraulic-brake components.");
  } else if (airHits !== hydHits) {
    // Both appear: the brake system the form names more often is the one it
    // is about.
    brakeMode = airHits > hydHits ? "air" : "hydraulic";
    reasons.push(
      `The form mentions both brake systems; ${brakeMode} is named more often.`,
    );
  } else if (
    /truck|tractor|bus|coach|trailer|heavy/.test(`${vehicleType} ${dutyClass}`)
  ) {
    brakeMode = "air";
    reasons.push(`Heavy vehicle (${vehicleType || dutyClass}) — air brakes assumed.`);
  } else {
    brakeMode = "hydraulic";
    reasons.push("No brake system stated — hydraulic assumed.");
  }

  const measured = measurementRows(source);
  const sourceHasTireMeasurements =
    measured.filter((row) => TIRE_MEASURE_RE.test(row.item)).length >= 2;
  const sourceHasBrakeMeasurements =
    measured.filter((row) => BRAKE_MEASURE_RE.test(row.item)).length >= 2;

  if (sourceHasTireMeasurements) {
    reasons.push("The form's own tire measurement table is replaced by the tire grid.");
  }
  if (sourceHasBrakeMeasurements) {
    reasons.push("The form's own brake measurement table is replaced by the brake grid.");
  }

  // Every inspection gets the grids; a source form's own measurement-only
  // tables are replaced by them (see applyImportGrids), not repeated.
  return {
    tireGrid: true,
    brakeGrid: true,
    batteryGrid: false,
    brakeMode,
    sourceHasTireMeasurements,
    sourceHasBrakeMeasurements,
    reasons,
  };
}

function fieldTypeFor(label: string): InspectionFormItem["fieldType"] {
  return /condition|status/i.test(label) ? "check" : "measurement";
}

function toFormItem(
  item: { item?: string | null; unit?: string | null },
  treadUnit: string | null,
): InspectionFormItem {
  const label = String(item.item ?? "").trim();
  const unit =
    treadUnit && /tread/i.test(label) ? treadUnit : (item.unit ?? null);
  return { item: label, unit, fieldType: fieldTypeFor(label) };
}

function masterTireGrid(title: string): InspectionFormSection | null {
  const found = masterInspectionList.find((s) => s.title.trim() === title);
  if (!found) return null;
  return {
    title: found.title,
    items: found.items.map((it) => ({ item: it.item, unit: it.unit ?? null })),
  };
}

function trailerAxleItems(
  kind: "tire" | "corner",
  mode: BrakeMode,
): Array<{ item: string; unit: string | null }> {
  const axles = ["Trailer 1", "Trailer 2"];
  const out: Array<{ item: string; unit: string | null }> = [];
  for (const axle of axles) {
    for (const side of ["Left", "Right"]) {
      if (kind === "tire") {
        out.push({ item: `${axle} ${side} Tire Pressure (Outer)`, unit: "psi" });
        out.push({ item: `${axle} ${side} Tire Pressure (Inner)`, unit: "psi" });
        out.push({ item: `${axle} ${side} Tread Depth (Outer)`, unit: "mm" });
        out.push({ item: `${axle} ${side} Tread Depth (Inner)`, unit: "mm" });
        out.push({ item: `${axle} ${side} Tire Condition`, unit: null });
      } else if (mode === "air") {
        out.push({ item: `${axle} ${side} Lining/Shoe`, unit: "mm" });
        out.push({ item: `${axle} ${side} Drum/Rotor`, unit: "mm" });
        out.push({ item: `${axle} ${side} Push Rod Travel`, unit: "in" });
      } else {
        // Hydraulic (surge or electric-over-hydraulic) trailer brakes have no
        // push rods.
        out.push({ item: `${axle} ${side} Brake Pad`, unit: "mm" });
        out.push({ item: `${axle} ${side} Rotor/Drum`, unit: "mm" });
      }
    }
  }
  return out;
}

function buildTireGrid(
  mode: BrakeMode,
  trailer: boolean,
  treadUnit: string | null,
): InspectionFormSection | null {
  const generatedGrid: GeneratedGridMeta = { kind: "tire", brakeMode: mode };
  if (trailer) {
    return {
      title: "Trailer Tire Grid",
      items: trailerAxleItems("tire", mode).map((it) => toFormItem(it, treadUnit)),
      generatedGrid,
    };
  }
  const base = masterTireGrid(
    mode === "air" ? TIRE_GRID_AIR_TITLE : TIRE_GRID_HYD_TITLE,
  );
  return base
    ? {
        title: base.title,
        items: base.items.map((it) => toFormItem(it, treadUnit)),
        generatedGrid,
      }
    : null;
}

function buildBrakeGrid(
  mode: BrakeMode,
  trailer: boolean,
): InspectionFormSection {
  const generatedGrid: GeneratedGridMeta = { kind: "brake", brakeMode: mode };
  if (trailer) {
    return {
      title: "Trailer Corner Grid",
      items: trailerAxleItems("corner", mode).map((it) => toFormItem(it, null)),
      generatedGrid,
    };
  }
  const base =
    mode === "air" ? buildAirCornerSection() : buildHydraulicCornerSection();
  return {
    title: base.title,
    items: (base.items ?? []).map((it) => toFormItem(it, null)),
    generatedGrid,
  };
}

function buildBatteryGrid(): InspectionFormSection {
  return {
    title: "Battery Grid",
    items: [
      { item: "Battery 1 Rated CCA", unit: "CCA", fieldType: "measurement" },
      { item: "Battery 1 Tested CCA", unit: "CCA", fieldType: "measurement" },
    ],
    generatedGrid: { kind: "battery", brakeMode: "air" },
  };
}

const TIRE_TABLE_TITLE_RE =
  /\b(?:tires?|tyres?|tread)\b.*\b(?:depth|pressure|tread)\b|\b(?:depth|pressure)\b.*\b(?:tires?|tyres?|tread)\b/i;
const BRAKE_TABLE_TITLE_RE =
  /\bbrakes?\b.*\b(?:measure\w*|lining|thickness|pads?|push\s*rod)\b|\b(?:lining|pads?|push\s*rod)\b/i;

/**
 * A source section that only tabulates readings the generated grid captures:
 * every row is a measurement and the title names tires/tread or brake wear.
 * Sections with any check row (condition, leaks, ...) are never touched.
 */
function isMeasurementOnlyTable(
  section: InspectionFormSection,
  titleRe: RegExp,
): boolean {
  const items = section.items ?? [];
  return (
    items.length > 0 &&
    titleRe.test(section.title) &&
    items.every((item) => item.fieldType === "measurement")
  );
}

/** Printed units say whether tread is read in 32nds of an inch. */
function prefersThirtySeconds(text: string): boolean {
  return /\/\s*32\b|\b32nds?\b|thirty[\s-]?seconds?/i.test(text);
}

/**
 * Returns the sections with the planned grids in place: any grid this module
 * added before is removed first, so toggling the plan on the review screen is
 * repeatable. The tire grids go at the top of the checklist, in the inspection builder's order.
 */
export function applyImportGrids(
  sections: readonly InspectionFormSection[],
  plan: ImportGridPlan,
  context: {
    vehicleType?: string | null;
    extractedText?: string | null;
    /**
     * Forces the tread unit. A saved template no longer carries the printed
     * form's units, so the caller states it ("32nds"); "mm" keeps the grid's
     * own default. Left out, it is read from the printed text when available.
     */
    treadUnit?: "32nds" | "mm" | null;
  } = {},
): InspectionFormSection[] {
  const base = sections.filter((section) => !isImportGridSection(section));
  const trailer = /trailer/i.test(context.vehicleType ?? "");
  const treadUnit =
    context.treadUnit === "32nds"
      ? "32nds"
      : context.treadUnit === "mm"
        ? null
        : prefersThirtySeconds(
              [
                context.extractedText ?? "",
                ...base.flatMap((s) => rows([s]).map((r) => r.item)),
              ].join("\n"),
            )
          ? "32nds"
          : null;

  const tire = plan.tireGrid ? buildTireGrid(plan.brakeMode, trailer, treadUnit) : null;
  const brake = plan.brakeGrid ? buildBrakeGrid(plan.brakeMode, trailer) : null;
  const battery = plan.batteryGrid ? buildBatteryGrid() : null;
  if (!tire && !brake && !battery) return base;

  // The source's own measurement-only tables would only repeat the grids.
  const rest = base.filter(
    (section) =>
      !(tire && isMeasurementOnlyTable(section, TIRE_TABLE_TITLE_RE)) &&
      !(brake && isMeasurementOnlyTable(section, BRAKE_TABLE_TITLE_RE)),
  );

  // Same order as the inspection builder: brakes, tires, battery, then the
  // rest of the checklist.
  return [
    ...[brake, tire, battery].filter(
      (section): section is InspectionFormSection => section !== null,
    ),
    ...rest,
  ];
}

/**
 * What the sections currently contain, so the review screen's checkboxes stay
 * truthful when a reviewer removes or renames a grid.
 */
export function currentImportGridPlan(
  sections: readonly InspectionFormSection[],
  fallbackMode: BrakeMode,
): ImportGridPlan {
  const grids = sections.filter(isImportGridSection);
  const brake = grids.find((s) => s.generatedGrid?.kind === "brake");
  const tire = grids.find((s) => s.generatedGrid?.kind === "tire");
  const battery = grids.find((s) => s.generatedGrid?.kind === "battery");
  return {
    tireGrid: Boolean(tire),
    brakeGrid: Boolean(brake),
    batteryGrid: Boolean(battery),
    brakeMode:
      brake?.generatedGrid?.brakeMode ??
      tire?.generatedGrid?.brakeMode ??
      fallbackMode,
  };
}
