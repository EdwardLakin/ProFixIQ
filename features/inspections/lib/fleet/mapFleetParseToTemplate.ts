import { masterInspectionList } from "@/features/inspections/lib/inspection/masterInspectionList";
import type { FleetFormProfile } from "./inferFleetFormProfile";
import type { FleetParseSection } from "./normalizeFleetParse";

export type MappedFleetSection = {
  title: string;
  items: { item: string; unit?: string | null }[];
};

const SECTION_ALIAS_RULES: Array<{ test: RegExp; target: string }> = [
  { test: /\bpowertrain\b|\bengine\b|\bengine compartment\b/i, target: "Powertrain / Engine Bay" },
  { test: /\bsuspension\b/i, target: "Suspension — Heavy Duty" },
  { test: /\bsteering\b/i, target: "Steering — Heavy Duty" },
  { test: /\btire\b|\bwheel\b/i, target: "Tires & Wheels" },
  { test: /\blighting\b|\blight\b|\breflector\b/i, target: "Lighting & Reflectors" },
  { test: /\bbody\b|\bchassis\b|\bframe\b/i, target: "Chassis / Frame / Body (HD CVIP)" },
  { test: /\bbrake\b/i, target: "Brakes — Air (Heavy Duty)" },
  { test: /\binterior\b|\bhvac\b|\bwiper\b/i, target: "Interior, HVAC & Wipers" },
  { test: /\belectrical\b/i, target: "Electrical System" },
  { test: /\bcoupler\b|\bfifth wheel\b|\bhitch\b/i, target: "Fifth Wheel / Hitch / Couplers (HD)" },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getTargetSectionTitle(sourceTitle: string, profile: FleetFormProfile): string {
  for (const rule of SECTION_ALIAS_RULES) {
    if (rule.test.test(sourceTitle)) return rule.target;
  }

  if (/certificate of inspection/i.test(sourceTitle)) return "Certificate / Signoff";
  if (/tread depth|tire pressure/i.test(sourceTitle)) {
    return profile.brakeMode === "air" ? "Tire Grid — Air Brake (HD)" : "Tires & Wheels";
  }

  return sourceTitle.trim() || "Imported Section";
}

function getMasterItemsBySection(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const section of masterInspectionList) {
    map.set(
      section.title,
      new Set(section.items.map((item) => normalize(item.item))),
    );
  }

  return map;
}

export function mapFleetParseToTemplate(args: {
  sections: FleetParseSection[];
  profile: FleetFormProfile;
}): MappedFleetSection[] {
  const masterBySection = getMasterItemsBySection();
  const grouped = new Map<string, { title: string; items: { item: string; unit?: string | null }[] }>();

  for (const section of args.sections) {
    const targetTitle = getTargetSectionTitle(section.title, args.profile);

    if (!grouped.has(targetTitle)) {
      grouped.set(targetTitle, { title: targetTitle, items: [] });
    }

    const bucket = grouped.get(targetTitle)!;
    const knownItems = masterBySection.get(targetTitle) ?? new Set<string>();
    const seen = new Set(bucket.items.map((item) => normalize(item.item)));

    for (const item of section.items) {
      const key = normalize(item.item);
      if (!key || seen.has(key)) continue;

      // Keep both matched + unmatched items.
      // Matched items help align to master section names,
      // unmatched items are preserved so customer-specific rows are not lost.
      if (knownItems.has(key) || !knownItems.has(key)) {
        bucket.items.push({
          item: item.item,
          unit: item.unit ?? null,
        });
        seen.add(key);
      }
    }
  }

  return Array.from(grouped.values()).filter((section) => section.items.length > 0);
}
