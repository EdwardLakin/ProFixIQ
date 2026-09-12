import {
  normalizeInspectionFormSections,
  type InspectionFormFieldType,
  type InspectionFormSection,
} from "@/features/inspections/lib/form-import";
import type {
  FleetPretripTemplateItem,
  FleetPretripTemplateSection,
} from "@/features/fleet/types/driverPortal";

/**
 * Adapts a template imported from a customer's paper form into the shape the
 * fleet driver pre-trip runner executes.
 *
 * The two systems already share storage (fleet_pretrip_template_assignments
 * joins inspection_templates); what was missing was the shape. An imported row
 * is {item, unit, fieldType}; a pre-trip item additionally needs a stable id,
 * one of the driver field types, a severity, and the dispatcher actions that
 * fire when a driver marks it failed.
 */

export const FLEET_PRETRIP_MAX_SECTIONS = 30;
export const FLEET_PRETRIP_MAX_ITEMS = 200;

const FIELD_TYPE_MAP: Record<
  Extract<InspectionFormFieldType, "check" | "defect" | "measurement">,
  FleetPretripTemplateItem["type"]
> = {
  check: "pass_fail",
  // The driver runner has no minor/major classification, so a defect row
  // becomes a pass/fail the driver can fail and annotate. The severity and
  // failure actions below are what decide how seriously a failure is treated.
  defect: "pass_fail",
  measurement: "number",
};

const SAFETY_SIGNALS =
  /\b(brake|steering|suspension|coupling|tire|tyre|wheel|hub|fastener|frame|air\s*brake|push\s*rod|seat\s*belt|emergency|fire|spill|dangerous\s*goods)\b/i;
const COMPLIANCE_SIGNALS =
  /\b(lamp|light|reflector|mirror|glass|windshield|wiper|washer|horn|documentation|decal|placard|plate|mud\s*flap|cargo\s*securement)\b/i;
const MAINTENANCE_SIGNALS =
  /\b(fluid|oil|coolant|fuel|exhaust|leak|heater|defroster|hydraulic|battery|belt|hose)\b/i;

function severityFor(label: string): FleetPretripTemplateItem["severity"] {
  if (SAFETY_SIGNALS.test(label)) return "safety";
  if (COMPLIANCE_SIGNALS.test(label)) return "compliance";
  if (MAINTENANCE_SIGNALS.test(label)) return "maintenance";
  return "recommend";
}

/**
 * Fleet item ids must match /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/ and be unique
 * across the whole template, because driver answers are keyed by them.
 */
function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return /^[A-Za-z0-9]/.test(slug) ? slug : fallback;
}

function uniqueId(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }
  for (let suffix = 2; ; suffix += 1) {
    const next = `${candidate.slice(0, 76)}-${suffix}`;
    if (!taken.has(next)) {
      taken.add(next);
      return next;
    }
  }
}

export type ImportedPretripAdaptation = {
  sections: FleetPretripTemplateSection[];
  /** Rows dropped because the template limits were already reached. */
  droppedItems: number;
  droppedSections: number;
};

export function adaptImportedTemplateForFleetPretrip(
  value: unknown,
): ImportedPretripAdaptation {
  const source: InspectionFormSection[] = normalizeInspectionFormSections(value);
  const sections: FleetPretripTemplateSection[] = [];
  const takenSectionIds = new Set<string>();
  const takenItemIds = new Set<string>();
  let itemCount = 0;
  let droppedItems = 0;
  let droppedSections = 0;

  for (const [sectionIndex, section] of source.entries()) {
    if (sections.length >= FLEET_PRETRIP_MAX_SECTIONS) {
      droppedSections += 1;
      droppedItems += section.items.length;
      continue;
    }

    const items: FleetPretripTemplateItem[] = [];
    for (const item of section.items) {
      // Templates imported before field types were recorded, and rows the old
      // generic editor stripped, carry no fieldType. The review screen and the
      // imported-template editor both fall back the same way, so publishing
      // has to as well — otherwise a legacy template either publishes a
      // silently shorter driver checklist or is rejected as having no rows.
      const fieldType =
        item.fieldType ?? (item.unit ? "measurement" : "check");
      if (
        fieldType !== "check" &&
        fieldType !== "defect" &&
        fieldType !== "measurement"
      ) {
        continue;
      }
      if (itemCount >= FLEET_PRETRIP_MAX_ITEMS) {
        droppedItems += 1;
        continue;
      }

      const label = item.item.trim().slice(0, 240);
      if (!label) continue;
      const severity = severityFor(label);
      const type = FIELD_TYPE_MAP[fieldType];
      items.push({
        id: uniqueId(
          slugify(label, `item-${itemCount + 1}`),
          takenItemIds,
        ),
        item: label,
        label,
        type,
        required: true,
        unit: type === "number" ? (item.unit?.trim().slice(0, 24) || null) : null,
        severity,
        failureActions: {
          notifyDispatcher: true,
          flagForReview: true,
          // A safety failure is the one a photo actually settles, and the one
          // that should take the unit out of service until someone looks.
          requirePhoto: severity === "safety",
          markVehicleAttention: severity === "safety",
        },
      });
      itemCount += 1;
    }

    if (!items.length) continue;
    sections.push({
      id: uniqueId(
        slugify(section.title, `section-${sectionIndex + 1}`),
        takenSectionIds,
      ),
      title: section.title.trim().slice(0, 120),
      items,
    });
  }

  return { sections, droppedItems, droppedSections };
}
