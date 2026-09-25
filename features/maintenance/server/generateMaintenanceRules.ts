import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { openai } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose, openAITemperatureParam } from "@/features/shared/lib/server/openai-models";
import {
  MAINTENANCE_SERVICE_CATALOG,
  canonicalizeServiceCode,
} from "./serviceCatalog";

const CATALOG_LABEL_BY_CODE = new Map(
  MAINTENANCE_SERVICE_CATALOG.map((entry) => [entry.code, entry.label]),
);

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
  /**
   * Client used for the catalog inserts. `maintenance_rules` and
   * `maintenance_services` are read-only to `authenticated`, so callers that
   * have already authorized the request pass a service-role client here.
   * Defaults to `supabase`.
   */
  writeClient?: SupabaseClient<DB>;
  /** Upper bound for the provider request; no retries when set. */
  timeoutMs?: number;
}): Promise<{
  servicesInserted: number;
  rulesInserted: number;
}> {
  const { supabase, year, make, model, engineFamily, forceRefresh, timeoutMs } =
    opts;
  const writeClient = opts.writeClient ?? supabase;

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
    const existingQuery = supabase
      .from("maintenance_rules")
      .select("id")
      .eq("make", trimmedMake)
      .eq("model", trimmedModel)
      .eq("year_from", year)
      .eq("year_to", year);

    const { data: existingRules, error: existingError } = await (
      normalizedEngineFamily
        ? existingQuery.eq("engine_family", normalizedEngineFamily)
        : existingQuery.is("engine_family", null)
    ).limit(1);

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
    "Use these service codes whenever a service matches one of them:",
    MAINTENANCE_SERVICE_CATALOG.map((entry) => `${entry.code} (${entry.label})`).join(", ") + ".",
    "Only invent a new UPPER_SNAKE_CASE code for a service none of these cover.",
    "Only include services that apply to this vehicle; a trailer or other unpowered asset has no engine, transmission or differential services.",
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
    model: getOpenAIModelForPurpose("fast"),
    ...openAITemperatureParam(getOpenAIModelForPurpose("fast"), 0.4),
    max_tokens: 900,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }, timeoutMs ? { timeout: timeoutMs, maxRetries: 0 } : undefined);

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

  // Map every generated code onto the shared catalog so the same service
  // keeps one code across vehicles and matches existing service history.
  const canonicalCodeByRaw = new Map<string, string>();
  const services: GeneratedMaintenanceService[] = [];
  for (const item of servicesArray) {
    const svc = parseService(item);
    if (!svc) continue;
    const code = canonicalizeServiceCode(svc.code, svc.label);
    canonicalCodeByRaw.set(svc.code, code);
    services.push({
      ...svc,
      code,
      label: CATALOG_LABEL_BY_CODE.get(code) ?? svc.label,
    });
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
    if (!rule) continue;
    const serviceCode =
      canonicalCodeByRaw.get(rule.service_code) ??
      canonicalizeServiceCode(rule.service_code);
    // Two generated services can map to the same catalog code; keep one rule each.
    if (rules.some((existing) => existing.service_code === serviceCode)) continue;
    rules.push({ ...rule, service_code: serviceCode });
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
    const { error: insertSvcError } = await writeClient
      .from("maintenance_services")
      .upsert(servicesToInsert, { onConflict: "code", ignoreDuplicates: true });
    if (insertSvcError) throw insertSvcError;
    servicesInserted = servicesToInsert.length;
  }

  let rulesInserted = 0;
  if (rules.length > 0) {
    // Conflict-safe: concurrent first lookups for the same vehicle spec hit
    // maintenance_rules_vehicle_service_key instead of inserting duplicates.
    const { error: insertRuleError } = await writeClient
      .from("maintenance_rules")
      .upsert(rules, {
        onConflict: "service_code,make,model,year_from,year_to,engine_family",
        ignoreDuplicates: true,
      });
    if (insertRuleError) throw insertRuleError;
    rulesInserted = rules.length;
  }

  return { servicesInserted, rulesInserted };
}
