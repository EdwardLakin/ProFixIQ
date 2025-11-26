import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { openai } from "lib/server/openai";

type DB = Database;

export type GeneratedMaintenanceService = {
  code: string;
  label: string;
  default_job_type: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
  default_labor_hours: number;
  default_notes: string;
};

export type GeneratedMaintenanceRule = {
  service_code: string;
  make: string | null;
  model: string | null;
  year_from: number | null;
  year_to: number | null;
  engine_family: string | null;
  distance_km_normal: number | null;
  distance_km_severe: number | null;
  time_months_normal: number | null;
  time_months_severe: number | null;
  first_due_km: number | null;
  first_due_months: number | null;
  is_critical: boolean;
};

type LlmServiceShape = {
  code?: unknown;
  label?: unknown;
  jobType?: unknown;
  typicalHours?: unknown;
  notes?: unknown;
};

type LlmRuleShape = {
  serviceCode?: unknown;
  distanceKmNormal?: unknown;
  distanceKmSevere?: unknown;
  timeMonthsNormal?: unknown;
  timeMonthsSevere?: unknown;
  firstDueKm?: unknown;
  firstDueMonths?: unknown;
  isCritical?: unknown;
};

type LlmPayloadShape = {
  services?: unknown;
  rules?: unknown;
};

function parseService(input: unknown): GeneratedMaintenanceService | null {
  const raw = input as LlmServiceShape;

  const code =
    typeof raw.code === "string" && raw.code.trim().length > 0
      ? raw.code.trim().toUpperCase()
      : null;
  const label =
    typeof raw.label === "string" && raw.label.trim().length > 0
      ? raw.label.trim()
      : null;

  const jobTypeRaw =
    typeof raw.jobType === "string" ? raw.jobType.trim().toLowerCase() : null;

  const validJobTypes: Array<
    GeneratedMaintenanceService["default_job_type"]
  > = ["diagnosis", "repair", "maintenance", "tech-suggested"];

  const jobType = (validJobTypes.includes(
    jobTypeRaw as GeneratedMaintenanceService["default_job_type"],
  )
    ? (jobTypeRaw as GeneratedMaintenanceService["default_job_type"])
    : "maintenance") satisfies GeneratedMaintenanceService["default_job_type"];

  const hoursNumber =
    typeof raw.typicalHours === "number" && Number.isFinite(raw.typicalHours)
      ? raw.typicalHours
      : 1;

  const notes =
    typeof raw.notes === "string" ? raw.notes.trim() : "Routine maintenance.";

  if (!code || !label) return null;

  return {
    code,
    label,
    default_job_type: jobType,
    default_labor_hours: hoursNumber,
    default_notes: notes,
  };
}

function parseRule(
  input: unknown,
  base: { make: string | null; model: string | null; year: number | null; engineFamily: string | null },
): GeneratedMaintenanceRule | null {
  const raw = input as LlmRuleShape;

  const serviceCode =
    typeof raw.serviceCode === "string" && raw.serviceCode.trim().length > 0
      ? raw.serviceCode.trim().toUpperCase()
      : null;

  if (!serviceCode) return null;

  const numberOrNull = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return null;
  };

  const boolOrFalse = (v: unknown): boolean =>
    typeof v === "boolean" ? v : false;

  const yearFrom = base.year ?? null;
  const yearTo = base.year ?? null;

  return {
    service_code: serviceCode,
    make: base.make,
    model: base.model,
    year_from: yearFrom,
    year_to: yearTo,
    engine_family: base.engineFamily,
    distance_km_normal: numberOrNull(raw.distanceKmNormal),
    distance_km_severe: numberOrNull(raw.distanceKmSevere),
    time_months_normal: numberOrNull(raw.timeMonthsNormal),
    time_months_severe: numberOrNull(raw.timeMonthsSevere),
    first_due_km: numberOrNull(raw.firstDueKm),
    first_due_months: numberOrNull(raw.firstDueMonths),
    is_critical: boolOrFalse(raw.isCritical),
  };
}

export async function generateMaintenanceRulesForVehicle(opts: {
  supabase: SupabaseClient<DB>;
  year: number;
  make: string;
  model: string;
  engineFamily?: string | null;
  forceRefresh?: boolean;
}): Promise<{
  servicesInserted: number;
  rulesInserted: number;
}> {
  const { supabase, year, make, model, engineFamily, forceRefresh } = opts;

  const trimmedMake = make.trim();
  const trimmedModel = model.trim();
  const normalizedEngineFamily =
    engineFamily && engineFamily.trim().length > 0
      ? engineFamily.trim()
      : null;

  if (!trimmedMake || !trimmedModel || !Number.isFinite(year)) {
    throw new Error("Missing or invalid year/make/model");
  }

  if (!forceRefresh) {
    const { data: existingRules, error: existingError } = await supabase
      .from("maintenance_rules")
      .select("id")
      .eq("make", trimmedMake)
      .eq("model", trimmedModel)
      .eq("year_from", year)
      .eq("year_to", year)
      .limit(1);

    if (existingError) throw existingError;
    if (existingRules && existingRules.length > 0) {
      return { servicesInserted: 0, rulesInserted: 0 };
    }
  }

  const systemPrompt = [
    "You are an auto maintenance data assistant for a repair shop.",
    "Given a specific year, make, model, and engine family,",
    "you will produce a structured JSON object describing maintenance services and their intervals.",
    "Output JSON only, no markdown.",
    "Shape:",
    "{",
    '  "services": [',
    "    {",
    '      "code": "OIL_CHANGE",',
    '      "label": "Engine oil & filter change",',
    '      "jobType": "maintenance",',
    '      "typicalHours": 0.8,',
    '      "notes": "Short description for the technician."',
    "    },",
    "    ...",
    "  ],",
    '  "rules": [',
    "    {",
    '      "serviceCode": "OIL_CHANGE",',
    '      "distanceKmNormal": 8000,',
    '      "distanceKmSevere": 6000,',
    '      "timeMonthsNormal": 6,',
    '      "timeMonthsSevere": 3,',
    '      "firstDueKm": 8000,',
    '      "firstDueMonths": 6,',
    '      "isCritical": true',
    "    },",
    "    ...",
    "  ]",
    "}",
    "Be realistic and conservative.",
    "Prefer kilometers, not miles.",
    "If you are not sure of exact manufacturer values, use reasonable averages.",
  ].join(" ");

  const userPrompt = [
    "Generate maintenance services and rules for this vehicle:",
    `Year: ${year}`,
    `Make: ${trimmedMake}`,
    `Model: ${trimmedModel}`,
    `Engine family: ${normalizedEngineFamily ?? "unknown"}`,
    "Return JSON only.",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 900,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content ?? "{}";

  let parsed: LlmPayloadShape;
  try {
    const asUnknown: unknown = JSON.parse(rawContent);
    parsed = (asUnknown ?? {}) as LlmPayloadShape;
  } catch {
    throw new Error("AI did not return valid JSON for maintenance rules.");
  }

  const servicesArray = Array.isArray(parsed.services)
    ? parsed.services
    : [];
  const rulesArray = Array.isArray(parsed.rules) ? parsed.rules : [];

  const services: GeneratedMaintenanceService[] = [];
  for (const item of servicesArray) {
    const svc = parseService(item);
    if (svc) services.push(svc);
  }

  const rules: GeneratedMaintenanceRule[] = [];
  const base = {
    make: trimmedMake,
    model: trimmedModel,
    year,
    engineFamily: normalizedEngineFamily,
  };
  for (const item of rulesArray) {
    const rule = parseRule(item, base);
    if (rule) rules.push(rule);
  }

  if (services.length === 0 || rules.length === 0) {
    throw new Error("AI did not return any usable maintenance services or rules.");
  }

  const uniqueServicesMap = new Map<string, GeneratedMaintenanceService>();
  services.forEach((svc) => {
    if (!uniqueServicesMap.has(svc.code)) {
      uniqueServicesMap.set(svc.code, svc);
    }
  });
  const uniqueServices = Array.from(uniqueServicesMap.values());

  const { data: existingServices, error: existingServicesError } =
    await supabase
      .from("maintenance_services")
      .select("code");

  if (existingServicesError) throw existingServicesError;

  const existingCodes = new Set<string>(
    (existingServices ?? []).map((row) =>
      typeof row.code === "string" ? row.code : "",
    ),
  );

  const servicesToInsert = uniqueServices.filter(
    (svc) => !existingCodes.has(svc.code),
  );

  let servicesInserted = 0;
  if (servicesToInsert.length > 0) {
    const { error: insertSvcError } = await supabase
      .from("maintenance_services")
      .insert(servicesToInsert);
    if (insertSvcError) throw insertSvcError;
    servicesInserted = servicesToInsert.length;
  }

  let rulesInserted = 0;
  if (rules.length > 0) {
    const { error: insertRuleError } = await supabase
      .from("maintenance_rules")
      .insert(rules);
    if (insertRuleError) throw insertRuleError;
    rulesInserted = rules.length;
  }

  return { servicesInserted, rulesInserted };
}
