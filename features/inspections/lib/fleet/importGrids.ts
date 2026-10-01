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
const BRAKE_GRID_AIR_TITLE = "Corner Grid (Air)";
const BRAKE_GRID_HYD_TITLE = "Corner Grid (Hydraulic)";

const CANONICAL_GRID_TITLES = new Set(
  [
    TIRE_GRID_AIR_TITLE,
    TIRE_GRID_HYD_TITLE,
    BRAKE_GRID_AIR_TITLE,
    BRAKE_GRID_HYD_TITLE,
  ].map((t) => t.toLowerCase()),
);

/** Titles of the grid sections this module adds (and may later remove). */
export function isImportGridSection(section: { title: string }): boolean {
  const t = section.title.trim().toLowerCase();
  return CANONICAL_GRID_TITLES.has(t) || /^trailer (?:tire|corner) grid$/.test(t);
}

const AIR_SIGNAL_RE =
  /\bair\s*(?:brakes?|system|tanks?|lines?|dryer|suspension)\b|brake chambers?|slack adjusters?|push\s*rods?|pushrod|tractor protection|spring brake|parking brake & emergency/i;
const HYD_SIGNAL_RE =
  /\bhydraulic\b|brake fluid|master cylinder|calipers?|brake booster/i;

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

  let brakeMode: BrakeMode;
  if (AIR_SIGNAL_RE.test(corpus)) {
    brakeMode = "air";
    reasons.push("The form mentions air-brake components.");
  } else if (HYD_SIGNAL_RE.test(corpus)) {
    brakeMode = "hydraulic";
    reasons.push("The form mentions hydraulic-brake components.");
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
    reasons.push("The form already has its own tire measurement rows.");
  }
  if (sourceHasBrakeMeasurements) {
    reasons.push("The form already has its own brake measurement rows.");
  }

  return {
    tireGrid: !sourceHasTireMeasurements,
    brakeGrid: !sourceHasBrakeMeasurements,
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
): Array<{ item: string; unit: string | null }> {
  const axles = ["Trailer 1", "Trailer 2"];
  const out: Array<{ item: string; unit: string | null }> = [];
  for (const axle of axles) {
    for (const side of ["Left", "Right"]) {
      if (kind === "tire") {
        out.push({ item: `${axle} ${side} Tire Pressure`, unit: "psi" });
        out.push({ item: `${axle} ${side} Tread Depth (Outer)`, unit: "mm" });
        out.push({ item: `${axle} ${side} Tread Depth (Inner)`, unit: "mm" });
        out.push({ item: `${axle} ${side} Tire Condition`, unit: null });
      } else {
        out.push({ item: `${axle} ${side} Lining/Shoe`, unit: "mm" });
        out.push({ item: `${axle} ${side} Drum/Rotor`, unit: "mm" });
        out.push({ item: `${axle} ${side} Push Rod Travel`, unit: "in" });
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
  if (trailer) {
    return {
      title: "Trailer Tire Grid",
      items: trailerAxleItems("tire").map((it) => toFormItem(it, treadUnit)),
    };
  }
  const base = masterTireGrid(
    mode === "air" ? TIRE_GRID_AIR_TITLE : TIRE_GRID_HYD_TITLE,
  );
  return base
    ? { title: base.title, items: base.items.map((it) => toFormItem(it, treadUnit)) }
    : null;
}

function buildBrakeGrid(
  mode: BrakeMode,
  trailer: boolean,
): InspectionFormSection {
  if (trailer) {
    return {
      title: "Trailer Corner Grid",
      items: trailerAxleItems("corner").map((it) => toFormItem(it, null)),
    };
  }
  const base =
    mode === "air" ? buildAirCornerSection() : buildHydraulicCornerSection();
  return {
    title: base.title,
    items: (base.items ?? []).map((it) => toFormItem(it, null)),
  };
}

/** Printed units say whether tread is read in 32nds of an inch. */
function prefersThirtySeconds(text: string): boolean {
  return /\/\s*32\b|\b32nds?\b|thirty[\s-]?seconds?/i.test(text);
}

function lastIndexWhere(
  sections: readonly InspectionFormSection[],
  test: RegExp,
): number {
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    if (test.test(sections[i].title)) return i;
  }
  return -1;
}

/**
 * Returns the sections with the planned grids in place: any grid this module
 * added before is removed first, so toggling the plan on the review screen is
 * repeatable. The tire grid goes after the form's tires section and the brake
 * grid after its brakes section; failing that, at the end of the checklist.
 */
export function applyImportGrids(
  sections: readonly InspectionFormSection[],
  plan: ImportGridPlan,
  context: {
    vehicleType?: string | null;
    extractedText?: string | null;
  } = {},
): InspectionFormSection[] {
  const base = sections.filter((section) => !isImportGridSection(section));
  const trailer = /trailer/i.test(context.vehicleType ?? "");
  const treadUnit = prefersThirtySeconds(
    [context.extractedText ?? "", ...base.flatMap((s) => rows([s]).map((r) => r.item))].join("\n"),
  )
    ? "32nds"
    : null;

  const tire = plan.tireGrid ? buildTireGrid(plan.brakeMode, trailer, treadUnit) : null;
  const brake = plan.brakeGrid ? buildBrakeGrid(plan.brakeMode, trailer) : null;
  if (!tire && !brake) return base;

  const tireAt = lastIndexWhere(base, /\b(?:tires?|tyres?|wheels?)\b/i);
  const brakeAt = lastIndexWhere(base, /\bbrakes?\b/i);

  // Insertions keyed by the original index they follow (-1 = append).
  const after = new Map<number, InspectionFormSection[]>();
  const add = (index: number, section: InspectionFormSection) => {
    const key = index < 0 ? base.length - 1 : index;
    after.set(key, [...(after.get(key) ?? []), section]);
  };
  if (brake) add(brakeAt, brake);
  if (tire) add(tireAt, tire);

  const out: InspectionFormSection[] = [];
  base.forEach((section, index) => {
    out.push(section, ...(after.get(index) ?? []));
  });
  if (base.length === 0) out.push(...[brake, tire].filter((s): s is InspectionFormSection => s !== null));
  return out;
}

const TIRE_GRID_TITLE_RE = /^(?:tire grid\b|trailer tire grid$)/i;
const BRAKE_GRID_TITLE_RE = /^(?:corner grid\b|trailer corner grid$)/i;

/**
 * What the sections currently contain, so the review screen's checkboxes stay
 * truthful when a reviewer removes a grid with the section's own Remove button.
 */
export function currentImportGridPlan(
  sections: readonly InspectionFormSection[],
  fallbackMode: BrakeMode,
): ImportGridPlan {
  const grids = sections.filter(isImportGridSection);
  const brake = grids.find((s) => BRAKE_GRID_TITLE_RE.test(s.title.trim()));
  const tire = grids.find((s) => TIRE_GRID_TITLE_RE.test(s.title.trim()));
  const titleMode = (section?: { title: string }): BrakeMode | null =>
    !section
      ? null
      : /\(air\)|air brake|^trailer/i.test(section.title)
        ? "air"
        : /hydraulic/i.test(section.title)
          ? "hydraulic"
          : null;
  return {
    tireGrid: Boolean(tire),
    brakeGrid: Boolean(brake),
    brakeMode: titleMode(brake) ?? titleMode(tire) ?? fallbackMode,
  };
}
