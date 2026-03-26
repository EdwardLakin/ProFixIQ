import type { Database } from "@shared/types/types/supabase";
import type { IntakeV1 } from "@/features/work-orders/intake/types";

type DB = Database;
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];

export type IntakeSuggestedLine = {
  description: string;
  complaint: string | null;
  notes: string | null;
  jobType: "inspection" | "maintenance" | "diagnosis" | "repair";
  laborTime: number | null;
  menuItemId?: string | null;
  inspectionTemplateId?: string | null;
  source: "menu_match" | "generic_fallback";
  score: number;
};

function clean(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function lower(input: unknown): string {
  return clean(input).toLowerCase();
}

function getStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const value = (obj as Record<string, unknown>)[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function getInspectionTemplateId(menuItem: MenuItemRow): string | null {
  return (
    getStringField(menuItem, "inspection_template_id") ??
    getStringField(menuItem, "template_id") ??
    getStringField(menuItem, "inspectionTemplateId") ??
    getStringField(menuItem, "inspection_template") ??
    null
  );
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => clean(v)).filter(Boolean))];
}

function buildIntakeNeedles(intake: IntakeV1): string[] {
  const concern = intake.concern.primary_text;
  const additional = intake.concern.additional_text ?? "";
  const recentWork = intake.concern.recent_work ?? "";
  const primarySystem = intake.symptoms.primary_system ?? "";
  const symptomTypes = Array.isArray(intake.symptoms.types)
    ? intake.symptoms.types
    : [];

  const keywordExpansions: Record<string, string[]> = {
    brakes: ["brake", "brakes", "brake noise", "brake inspection", "pads", "rotors", "caliper"],
    suspension_steering: ["steering", "suspension", "front end", "alignment", "tie rod", "ball joint"],
    tires_wheels: ["tire", "tires", "wheel", "rotation", "balance", "alignment"],
    engine: ["engine", "misfire", "rough idle", "no start", "starting", "stall"],
    aftertreatment: ["dpf", "def", "regen", "aftertreatment"],
    transmission: ["transmission", "shift", "slip", "hard shift"],
    drivetrain: ["driveline", "u-joint", "drivetrain", "diff", "axle"],
    electrical: ["battery", "charging", "electrical", "alternator", "starter"],
    hvac: ["hvac", "heat", "ac", "air conditioning"],
    pm_service: ["maintenance", "service", "pm", "oil change", "inspection"],
    inspection_only: ["inspection", "check over", "look over"],
    other: [],
  };

  const expanded = keywordExpansions[primarySystem] ?? [];

  return uniqueStrings([
    concern,
    additional,
    recentWork,
    primarySystem,
    ...symptomTypes,
    ...expanded,
  ]);
}

function textHitScore(haystack: string, needles: string[]): number {
  if (!haystack.trim()) return 0;

  const hay = haystack.toLowerCase();
  let score = 0;

  for (const needle of needles) {
    const n = needle.toLowerCase().trim();
    if (!n) continue;

    if (hay.includes(n)) {
      score += n.length >= 10 ? 30 : 18;
      continue;
    }

    const nTokens = tokenize(n);
    if (nTokens.length > 0) {
      const matched = nTokens.filter((t) => hay.includes(t)).length;
      if (matched > 0) score += matched * 5;
    }
  }

  return score;
}

function scoreMenuItem(menuItem: MenuItemRow, intake: IntakeV1): number {
  const needles = buildIntakeNeedles(intake);

  const haystack = [
    menuItem.name,
    menuItem.description,
    getStringField(menuItem, "category"),
    getStringField(menuItem, "service_key"),
    getStringField(menuItem, "complaint"),
    getStringField(menuItem, "cause"),
    getStringField(menuItem, "correction"),
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" | ");

  let score = textHitScore(haystack, needles);

  const templateId = getInspectionTemplateId(menuItem);
  if (templateId) score += 20;

  const concernLower = lower(intake.concern.primary_text);
  const nameLower = lower(menuItem.name);
  if (concernLower && nameLower && concernLower === nameLower) {
    score += 40;
  }

  if (
    intake.symptoms.primary_system === "brakes" &&
    /brake|pads|rotors|caliper/.test(nameLower)
  ) {
    score += 25;
  }

  if (
    intake.symptoms.primary_system === "pm_service" &&
    /maintenance|service|oil/.test(nameLower)
  ) {
    score += 18;
  }

  if (
    intake.symptoms.primary_system === "inspection_only" &&
    /inspection|check/.test(nameLower)
  ) {
    score += 18;
  }

  return score;
}

function buildComplaintText(intake: IntakeV1): string {
  const bits = [
    clean(intake.concern.primary_text),
    clean(intake.concern.additional_text),
  ].filter(Boolean);

  return bits.join(" — ");
}

function buildNotesText(intake: IntakeV1): string | null {
  const parts: string[] = [];

  const primarySystem = clean(intake.symptoms.primary_system);
  if (primarySystem) parts.push(`System: ${primarySystem.replaceAll("_", " ")}`);

  const types = Array.isArray(intake.symptoms.types)
    ? intake.symptoms.types
        .map((x: string) => clean(x).replaceAll("_", " "))
        .filter(Boolean)
    : [];
  if (types.length) parts.push(`Symptoms: ${types.join(", ")}`);

  const recentWork = clean(intake.concern.recent_work);
  if (recentWork) parts.push(`Recent work: ${recentWork}`);

  return parts.length ? parts.join(" • ") : null;
}

export function buildIntakeSuggestedLines(args: {
  intake: IntakeV1;
  menuItems: MenuItemRow[];
}): IntakeSuggestedLine[] {
  const { intake, menuItems } = args;

  const scored = menuItems
    .filter((mi) => mi.is_active !== false)
    .map((mi) => ({
      menuItem: mi,
      score: scoreMenuItem(mi, intake),
      inspectionTemplateId: getInspectionTemplateId(mi),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const complaint = buildComplaintText(intake) || null;
  const notes = buildNotesText(intake);

  if (best && best.score >= 35) {
    const mi = best.menuItem;

    return [
      {
        description: clean(mi.name) || "Intake service",
        complaint,
        notes: clean(mi.description) || notes,
        jobType: best.inspectionTemplateId ? "inspection" : "maintenance",
        laborTime:
          typeof mi.labor_time === "number" && Number.isFinite(mi.labor_time)
            ? mi.labor_time
            : null,
        menuItemId: mi.id,
        inspectionTemplateId: best.inspectionTemplateId,
        source: "menu_match",
        score: best.score,
      },
    ];
  }

  return [
    {
      description: complaint ? `Complaint: ${complaint}` : "Customer concern",
      complaint,
      notes,
      jobType: "diagnosis",
      laborTime: 1,
      menuItemId: null,
      inspectionTemplateId: null,
      source: "generic_fallback",
      score: 0,
    },
  ];
}
