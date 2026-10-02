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

const DUAL_PRESSURE_RE =
  /^((?:Drive|Rear|Tag|Trailer)\s*\d*\s+(?:Left|Right))\s+Tire Pressure$/i;

function masterTireGrid(title: string): InspectionFormSection | null {
  const found = masterInspectionList.find((s) => s.title.trim() === title);
  if (!found) return null;
  // The shared master list has one pressure per side on a dual axle; the tire
  // grid reads an outer and an inner tire, so an imported template gets both.
  const items = found.items.flatMap((it) => {
    const dual = DUAL_PRESSURE_RE.exec(it.item);
    if (!dual) return [{ item: it.item, unit: it.unit ?? null }];
    return (["Outer", "Inner"] as const).map((pos) => ({
      item: `${dual[1]} Tire Pressure (${pos})`,
      unit: it.unit ?? null,
    }));
  });
  return { title: found.title, items };
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
 * every row is a measurement, and either the title names them or every row
 * label does (so a plainly titled "Tires" table is found too, by the same
 * row test detection uses). A section with any check row is never touched.
 */
function isMeasurementOnlyTable(
  section: InspectionFormSection,
  titleRe: RegExp,
  rowRe: RegExp,
): boolean {
  const items = section.items ?? [];
  return (
    items.length > 0 &&
    items.every((item) => item.fieldType === "measurement") &&
    (titleRe.test(section.title) || items.every((item) => rowRe.test(item.item)))
  );
}

// An air-brake checklist read from a heavy-vehicle form, rewritten for a
// hydraulic system when the reviewer says the vehicle has hydraulic brakes.
// Air-only rows with no hydraulic counterpart are dropped; the printed section
// is kept on `adaptedFrom` so switching back restores it exactly.
const AIR_SECTION_TITLE_RE = /\bair\s*brakes?\b/i;
const HYDRAULIC_ROW_MAP: ReadonlyArray<readonly [RegExp, string | null]> = [
  [/air\s*system\s*leak/i, "Hydraulic System Leakage"],
  [/air\s*tanks?/i, "Brake Fluid Reservoir / Master Cylinder"],
  [/brake\s*valves?/i, "Brake Lines & Hoses"],
  [/tractor\s*protection/i, null],
  [/brake\s*chambers?/i, "Calipers / Wheel Cylinders"],
  [/slack\s*adjust|push\s*rods?|compressor|air\s*dryer|governor/i, null],
];

function adaptBrakeChecklists(
  sections: readonly InspectionFormSection[],
  mode: BrakeMode,
): InspectionFormSection[] {
  // Always start from the printed form, so the result never depends on what
  // an earlier pass did.
  const printed = sections.map((section) => section.adaptedFrom ?? section);
  if (mode !== "hydraulic") return printed;
  return printed.map((section) => {
    if (isImportGridSection(section) || !AIR_SECTION_TITLE_RE.test(section.title)) {
      return section;
    }
    const items = section.items.flatMap((item) => {
      const hit = HYDRAULIC_ROW_MAP.find(([re]) => re.test(item.item));
      if (!hit) return [item];
      return hit[1] === null ? [] : [{ ...item, item: hit[1] }];
    });
    if (!items.length) return section;
    return {
      title: section.title.replace(AIR_SECTION_TITLE_RE, "Hydraulic Brakes"),
      items,
      adaptedFrom: section,
    };
  });
}

/**
 * With a tire (or brake) grid on, a stray reading row inside a checklist
 * section ("Tire Tread Depth") is the grid's job. Left as a measurement it
 * shows a value box beside a plain pass/fail list, so it becomes OK / FAIL / NA.
 */
function readingRowsToChecks(
  sections: readonly InspectionFormSection[],
  rowRes: readonly RegExp[],
): InspectionFormSection[] {
  if (rowRes.length === 0) return [...sections];
  return sections.map((section) =>
    isImportGridSection(section)
      ? section
      : {
          ...section,
          items: section.items.map((item) =>
            item.fieldType === "measurement" &&
            rowRes.some((re) => re.test(item.item))
              ? { ...item, fieldType: "check" as const, unit: null }
              : item,
          ),
        },
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
  // Tables an earlier pass replaced come back first, so turning a grid off
  // (or switching brake system) never loses the form's own readings.
  const restored = sections
    .filter(isImportGridSection)
    .flatMap((section) => section.generatedGrid?.replaced ?? []);
  const base = adaptBrakeChecklists(
    [...restored, ...sections.filter((section) => !isImportGridSection(section))],
    plan.brakeMode,
  );
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

  // The source's own measurement-only tables would only repeat the grids. They
  // are kept on the grid that replaced them so the replacement is reversible.
  const tireReplaced = tire
    ? base.filter((section) =>
        isMeasurementOnlyTable(section, TIRE_TABLE_TITLE_RE, TIRE_MEASURE_RE),
      )
    : [];
  const brakeReplaced = brake
    ? base.filter(
        (section) =>
          !tireReplaced.includes(section) &&
          isMeasurementOnlyTable(section, BRAKE_TABLE_TITLE_RE, BRAKE_MEASURE_RE),
      )
    : [];
  const replaced = new Set([...tireReplaced, ...brakeReplaced]);
  const rest = readingRowsToChecks(
    base.filter((section) => !replaced.has(section)),
    [...(tire ? [TIRE_MEASURE_RE] : []), ...(brake ? [BRAKE_MEASURE_RE] : [])],
  );
  const remember = (
    grid: InspectionFormSection | null,
    dropped: InspectionFormSection[],
  ) =>
    grid && dropped.length && grid.generatedGrid
      ? { ...grid, generatedGrid: { ...grid.generatedGrid, replaced: dropped } }
      : grid;

  // Same order as the inspection builder: brakes, tires, battery, then the
  // rest of the checklist.
  return [
    ...[remember(brake, brakeReplaced), remember(tire, tireReplaced), battery].filter(
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
