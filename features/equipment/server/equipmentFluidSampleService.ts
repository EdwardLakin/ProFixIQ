import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { canManageComponents, canRecordComponentWork } from "@/features/equipment/lib/components";
import {
  buildFluidHistory,
  isLabFlag,
  latestFluidSampleSummaries,
  validateFluidSample,
  type FluidSample,
  type FluidSampleGroup,
  type FluidSampleResult,
  type FluidSampleSummary,
} from "@/features/equipment/lib/fluids";
import { validateVoidReason } from "@/features/equipment/lib/pm";
import { authorizeEquipmentAsset } from "@/features/equipment/server/equipmentAssetProfileService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";

type DB = Database;
type SampleRow = DB["public"]["Tables"]["equipment_fluid_samples"]["Row"];
type ResultRow = DB["public"]["Tables"]["equipment_fluid_sample_results"]["Row"];

const SAMPLE_COLUMNS =
  "id,shop_id,sequence,vehicle_id,component_id,fluid_type,sampled_at,asset_hours,fluid_hours,fluid_distance,fluid_distance_unit,lab_name,lab_report_number,lab_status,notes,recorded_by,created_at,voided_at,voided_by,void_reason";
const RESULT_COLUMNS = "id,shop_id,sample_id,position,analyte,value,unit,lab_flag,created_at";
const PAGE = 1_000;
const MAX_PAGES = 50;
const CHUNK = 100;

export class EquipmentFluidSampleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapResult(row: ResultRow): FluidSampleResult {
  return {
    analyte: row.analyte,
    value: Number(row.value),
    unit: row.unit,
    labFlag: isLabFlag(row.lab_flag) ? row.lab_flag : null,
  };
}

function mapSample(
  row: SampleRow,
  componentNames: Map<string, string>,
  results: FluidSampleResult[],
): FluidSample {
  return {
    id: row.id,
    sequence: Number(row.sequence),
    componentId: row.component_id,
    componentName: row.component_id ? componentNames.get(row.component_id) ?? null : null,
    fluidType: row.fluid_type,
    sampledAt: row.sampled_at,
    assetHours: row.asset_hours,
    fluidHours: numberOrNull(row.fluid_hours),
    fluidDistance: numberOrNull(row.fluid_distance),
    fluidDistanceUnit: row.fluid_distance_unit,
    labName: row.lab_name,
    labReportNumber: row.lab_report_number,
    labStatus: row.lab_status,
    notes: row.notes,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    voided: row.voided_at ? { at: row.voided_at, reason: row.void_reason ?? "" } : null,
    results,
  };
}

async function readSamples(
  admin: SupabaseClient<DB>,
  shopId: string,
  assetId: string,
  liveOnly: boolean,
): Promise<SampleRow[]> {
  const rows: SampleRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = admin
      .from("equipment_fluid_samples")
      .select(SAMPLE_COLUMNS)
      .eq("shop_id", shopId)
      .eq("vehicle_id", assetId);
    if (liveOnly) query = query.is("voided_at", null);
    const { data, error } = await query
      .order("sampled_at", { ascending: false })
      .order("sequence", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new EquipmentFluidSampleError("Unable to load fluid samples.", 500);
    rows.push(...((data ?? []) as SampleRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function readResults(
  admin: SupabaseClient<DB>,
  shopId: string,
  sampleIds: string[],
): Promise<Map<string, FluidSampleResult[]>> {
  const bySample = new Map<string, ResultRow[]>();
  for (let offset = 0; offset < sampleIds.length; offset += CHUNK) {
    const ids = sampleIds.slice(offset, offset + CHUNK);
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { data, error } = await admin
        .from("equipment_fluid_sample_results")
        .select(RESULT_COLUMNS)
        .eq("shop_id", shopId)
        .in("sample_id", ids)
        .order("sample_id", { ascending: true })
        .order("position", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new EquipmentFluidSampleError("Unable to load fluid sample results.", 500);
      for (const row of (data ?? []) as ResultRow[]) {
        const list = bySample.get(row.sample_id) ?? [];
        list.push(row);
        bySample.set(row.sample_id, list);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  const mapped = new Map<string, FluidSampleResult[]>();
  for (const [sampleId, rows] of bySample) {
    mapped.set(sampleId, [...rows].sort((a, b) => a.position - b.position).map(mapResult));
  }
  return mapped;
}

async function componentNamesFor(
  admin: SupabaseClient<DB>,
  shopId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const chunk = ids.slice(offset, offset + CHUNK);
    if (!chunk.length) continue;
    const { data, error } = await admin
      .from("equipment_components")
      .select("id,label")
      .eq("shop_id", shopId)
      .in("id", chunk);
    if (error) throw new EquipmentFluidSampleError("Unable to load components.", 500);
    for (const row of data ?? []) names.set(row.id, row.label);
  }
  return names;
}

function componentIdsOf(rows: SampleRow[]): string[] {
  return Array.from(
    new Set(rows.map((row) => row.component_id).filter((id): id is string => Boolean(id))),
  );
}

async function componentPickerFor(
  admin: SupabaseClient<DB>,
  shopId: string,
  assetId: string,
): Promise<Array<{ id: string; label: string }>> {
  const ids = new Set<string>();

  const { data: installed, error: installedError } = await admin
    .from("equipment_components")
    .select("id")
    .eq("shop_id", shopId)
    .eq("installed_vehicle_id", assetId)
    .limit(PAGE);
  if (installedError) throw new EquipmentFluidSampleError("Unable to load components.", 500);
  for (const row of installed ?? []) ids.add(row.id);

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await admin
      .from("equipment_component_events")
      .select("component_id")
      .eq("shop_id", shopId)
      .eq("vehicle_id", assetId)
      .in("event_type", ["installed", "removed"])
      .order("sequence", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new EquipmentFluidSampleError("Unable to load component history.", 500);
    for (const row of data ?? []) ids.add(row.component_id);
    if (!data || data.length < PAGE) break;
  }

  const names = await componentNamesFor(admin, shopId, Array.from(ids));
  return Array.from(names, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export type AssetFluidSamples = {
  groups: FluidSampleGroup[];
  /** Components installed now or historically on the asset, for backdated reports. */
  components: Array<{ id: string; label: string }>;
  /** Current hour meter, offered as the default for a sample taken now. */
  assetHours: number | null;
};

/**
 * Fluid samples recorded on an asset, grouped by component and fluid type with
 * per-analyte trends. The asset is authorized with the vehicle-workspace rules
 * (shop scope, mechanic assignment) through the caller's RLS client before any
 * privileged read. Returns null when the asset is not visible.
 */
export async function loadAssetFluidSamples(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
}): Promise<AssetFluidSamples | null> {
  const asset = await authorizeEquipmentAsset(input);
  if (!asset) return null;

  const rows = await readSamples(input.admin, input.shopId, input.assetId, false);
  const [results, names, components] = await Promise.all([
    readResults(input.admin, input.shopId, rows.map((row) => row.id)),
    componentNamesFor(input.admin, input.shopId, componentIdsOf(rows)),
    componentPickerFor(input.admin, input.shopId, input.assetId),
  ]);

  return {
    groups: buildFluidHistory(rows.map((row) => mapSample(row, names, results.get(row.id) ?? []))),
    components,
    assetHours: asset.engineHours,
  };
}

/**
 * Latest live sample per component and fluid type, for an asset the caller has
 * already been authorized to see (Asset Health authorizes first). Read with
 * the privileged client, scoped to the shop.
 */
export async function loadFluidSampleSummaries(input: {
  admin: SupabaseClient<DB>;
  shopId: string;
  assetId: string;
}): Promise<FluidSampleSummary[]> {
  const rows = await readSamples(input.admin, input.shopId, input.assetId, true);
  if (!rows.length) return [];
  const names = await componentNamesFor(input.admin, input.shopId, componentIdsOf(rows));
  return latestFluidSampleSummaries(rows.map((row) => mapSample(row, names, [])));
}

type WriteContext = {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  actorUserId: string;
};

function rpcFailure(
  scope: string,
  error: { code?: string | null; message: string },
  notFound: string,
): never {
  switch (error.code) {
    case "P0002":
      throw new EquipmentFluidSampleError(notFound, 404);
    case "23505":
      if (/lab_report/i.test(error.message)) {
        throw new EquipmentFluidSampleError(
          "This lab report number is already recorded for this asset.",
          409,
        );
      }
      throw new EquipmentFluidSampleError("Each analyte can be entered once per sample.", 400);
    case "23514":
      throw new EquipmentFluidSampleError(
        /installed on the asset at that time/i.test(error.message)
          ? "That component was not installed on this asset at the sample date."
          : /component/i.test(error.message)
            ? "That component is not installed on this asset."
            : "The fluid sample is invalid.",
        400,
      );
    case "22023":
    case "22P02":
    case "22003":
    case "22007":
    case "22008":
      if (/different request/i.test(error.message)) {
        throw new EquipmentFluidSampleError(
          "This request was already submitted with different values. Refresh and try again.",
          409,
        );
      }
      if (/already voided/i.test(error.message)) {
        throw new EquipmentFluidSampleError("This sample is already voided.", 409);
      }
      throw new EquipmentFluidSampleError("The fluid sample request is invalid.", 400);
    default:
      console.error(`[equipment/fluid-samples] ${scope} failed`, {
        code: error.code ?? null,
        message: error.message,
      });
      throw new EquipmentFluidSampleError("The fluid sample could not be saved.", 500);
  }
}

function requireOperationKey(body: unknown): string {
  const key = (body as { operationKey?: unknown } | null)?.operationKey;
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    throw new EquipmentFluidSampleError("An operation key is required.", 400);
  }
  return key;
}

/**
 * Record a lab fluid sample with its results (managers and mechanics;
 * mechanics only on assets visible to them). The sample and results are
 * written atomically and retry-safe.
 */
export async function recordFluidSample(
  context: WriteContext & { assetId: string; body: unknown; now?: number },
): Promise<{ id: string }> {
  if (!canRecordComponentWork(context.role)) {
    throw new EquipmentFluidSampleError("Your role cannot record fluid samples.", 403);
  }
  const operationKey = requireOperationKey(context.body);
  const validation = validateFluidSample(context.body, context.now);
  if (!validation.ok) throw new EquipmentFluidSampleError(validation.error, 400);
  const sample = validation.value;

  const asset = await authorizeEquipmentAsset({ ...context, assetId: context.assetId });
  if (!asset) throw new EquipmentFluidSampleError("Asset not found.", 404);

  const { data, error } = await context.admin.rpc("equipment_fluid_sample_record", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_vehicle_id: asset.id,
    p_sample: {
      component_id: sample.componentId,
      fluid_type: sample.fluidType,
      sampled_at: sample.sampledAt,
      // Keep idempotency based only on client intent. The UI may offer the
      // current meter as a default, but the server must not inject a mutable
      // meter value after the operation key has been chosen.
      asset_hours: sample.assetHours,
      fluid_hours: sample.fluidHours,
      fluid_distance: sample.fluidDistance,
      fluid_distance_unit: sample.fluidDistanceUnit,
      lab_name: sample.labName,
      lab_report_number: sample.labReportNumber,
      lab_status: sample.labStatus,
      notes: sample.notes,
    },
    p_results: sample.results.map((result) => ({
      analyte: result.analyte,
      value: result.value,
      unit: result.unit,
      lab_flag: result.labFlag,
    })),
    p_operation_key: operationKey,
  });
  if (error) rpcFailure("record", error, "Asset not found.");
  return { id: (data as { id: string }).id };
}

/** Void a mistaken sample with a reason (component managers only). */
export async function voidFluidSample(
  context: WriteContext & { sampleId: string; body: unknown },
): Promise<{ id: string }> {
  if (!canManageComponents(context.role)) {
    throw new EquipmentFluidSampleError("Your role cannot void fluid samples.", 403);
  }
  const operationKey = requireOperationKey(context.body);
  const reason = validateVoidReason((context.body as { reason?: unknown }).reason);
  if (!reason.ok) throw new EquipmentFluidSampleError(reason.error, 400);

  const { data: row, error } = await context.admin
    .from("equipment_fluid_samples")
    .select("id,vehicle_id")
    .eq("shop_id", context.shopId)
    .eq("id", context.sampleId)
    .maybeSingle();
  if (error) throw new EquipmentFluidSampleError("Unable to load the sample.", 500);
  if (!row) throw new EquipmentFluidSampleError("Sample not found.", 404);
  const asset = await authorizeEquipmentAsset({ ...context, assetId: row.vehicle_id });
  if (!asset) throw new EquipmentFluidSampleError("Sample not found.", 404);

  const { data, error: rpcError } = await context.admin.rpc("equipment_fluid_sample_void", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_sample_id: context.sampleId,
    p_reason: reason.value,
    p_operation_key: operationKey,
  });
  if (rpcError) rpcFailure("void", rpcError, "Sample not found.");
  return { id: (data as { id: string }).id };
}