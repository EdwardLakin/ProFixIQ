import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  buildComponentTree,
  COMPONENT_STATUSES,
  componentLabel,
  componentTemplateForClass,
  type ComponentActionInput,
  type ComponentEventType,
  type ComponentFields,
  type ComponentStatus,
  type EquipmentComponent,
  type EquipmentComponentDetail,
  type EquipmentComponentEvent,
  canManageComponents,
  isComponentWorkAction,
  type EquipmentComponentNode,
} from "@/features/equipment/lib/components";
import { authorizeEquipmentAsset } from "@/features/equipment/server/equipmentAssetProfileService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";

type DB = Database;
type ComponentRow = DB["public"]["Tables"]["equipment_components"]["Row"];
type EventRow = DB["public"]["Tables"]["equipment_component_events"]["Row"];

const COMPONENT_COLUMNS =
  "id,shop_id,component_type,position,label,manufacturer,model,serial_number,part_number,status,installed_vehicle_id,parent_component_id,installed_at,installed_asset_hours,component_hours_at_install,attributes,created_at,updated_at,created_by,updated_by";
const EVENT_COLUMNS =
  "id,shop_id,component_id,sequence,event_type,vehicle_id,asset_hours,component_hours,occurred_at,work_order_id,notes,details,recorded_by,created_at";
const PAGE = 1_000;
/** Events that are not lifecycle/service evidence for "last event". */
const LIFECYCLE_EXCLUDED = new Set(["created", "updated"]);

function detailsOf(value: unknown): EquipmentComponentEvent["details"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: NonNullable<EquipmentComponentEvent["details"]> = {};
  for (const [field, change] of Object.entries(value as Record<string, unknown>)) {
    if (change && typeof change === "object" && !Array.isArray(change)) {
      const { from, to } = change as { from?: unknown; to?: unknown };
      out[field] = { from: from ?? null, to: to ?? null };
    }
  }
  return out;
}

export class EquipmentComponentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

function attributesOf(value: unknown): EquipmentComponent["attributes"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: EquipmentComponent["attributes"] = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (
      raw === null ||
      typeof raw === "string" ||
      typeof raw === "boolean" ||
      (typeof raw === "number" && Number.isFinite(raw))
    ) {
      out[key] = raw;
    }
  }
  return out;
}

/** Component life = life at install + asset hours accumulated since install. */
export function componentHours(
  row: Pick<ComponentRow, "status" | "installed_asset_hours" | "component_hours_at_install">,
  currentAssetHours: number | null,
): number | null {
  if (
    row.status === "installed" &&
    row.installed_asset_hours !== null &&
    currentAssetHours !== null &&
    currentAssetHours >= row.installed_asset_hours
  ) {
    return (row.component_hours_at_install ?? 0) + (currentAssetHours - row.installed_asset_hours);
  }
  return row.component_hours_at_install;
}

export function mapComponentRow(
  row: ComponentRow,
  currentAssetHours: number | null,
  lastEvent: EventRow | null,
): EquipmentComponent {
  return {
    id: row.id,
    componentType: row.component_type,
    position: row.position,
    label: row.label,
    displayName: row.label || componentLabel(row.component_type, row.position),
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    partNumber: row.part_number,
    status: (COMPONENT_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as ComponentStatus)
      : "in_stock",
    installedAssetId: row.installed_vehicle_id,
    parentComponentId: row.parent_component_id,
    installedAt: row.installed_at,
    componentHours: componentHours(row, currentAssetHours),
    attributes: attributesOf(row.attributes),
    lastEvent: lastEvent
      ? { eventType: lastEvent.event_type as ComponentEventType, occurredAt: lastEvent.occurred_at }
      : null,
  };
}

function rpcFailure(error: { code?: string | null; message: string }): never {
  switch (error.code) {
    case "P0002":
      throw new EquipmentComponentError("Component or asset not found.", 404);
    case "23505":
      throw new EquipmentComponentError(
        "Another active component of this type already has that serial number.",
        409,
      );
    case "23514":
      throw new EquipmentComponentError(
        /parent/i.test(error.message)
          ? "The parent component must be installed on the same asset."
          : /cycle/i.test(error.message)
            ? "A component cannot be placed inside itself."
            : /scrapped/i.test(error.message)
              ? "Scrapped components cannot change."
              : /work order must be for/i.test(error.message)
                ? "That work order is for a different asset."
                : "That component, asset or work order is not in this shop.",
        409,
      );
    case "22023":
    case "22P02":
      throw new EquipmentComponentError("The component request is invalid.", 400);
    default:
      console.error("[equipment/components] write failed", {
        code: error.code ?? null,
        message: error.message,
      });
      throw new EquipmentComponentError("The component could not be saved.", 500);
  }
}

async function latestEvents(
  admin: SupabaseClient<DB>,
  shopId: string,
  componentIds: string[],
): Promise<Map<string, EventRow>> {
  const latest = new Map<string, EventRow>();
  for (let offset = 0; offset < componentIds.length; offset += 100) {
    const chunk = componentIds.slice(offset, offset + 100);
    for (let page = 0; page < 50; page += 1) {
      const { data, error } = await admin
        .from("equipment_component_events")
        .select(EVENT_COLUMNS)
        .eq("shop_id", shopId)
        .in("component_id", chunk)
        .not("event_type", "in", "(created,updated)")
        .order("occurred_at", { ascending: false })
        .order("sequence", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new EquipmentComponentError("Unable to load component history.", 500);
      for (const row of (data ?? []) as EventRow[]) {
        if (!latest.has(row.component_id)) latest.set(row.component_id, row);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return latest;
}

/**
 * Component tree installed on an asset. The asset is authorized with the
 * vehicle-workspace rules (shop scope, mechanic assignment) through the
 * caller's RLS client before the privileged read.
 */
export async function loadAssetComponents(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
}): Promise<{ assetHours: number | null; tree: EquipmentComponentNode[] } | null> {
  const asset = await authorizeEquipmentAsset(input);
  if (!asset) return null;

  const { data, error } = await input.admin
    .from("equipment_components")
    .select(COMPONENT_COLUMNS)
    .eq("shop_id", input.shopId)
    .eq("installed_vehicle_id", input.assetId)
    .order("id", { ascending: true })
    .limit(PAGE);
  if (error) throw new EquipmentComponentError("Unable to load components.", 500);
  const rows = (data ?? []) as ComponentRow[];
  const events = await latestEvents(input.admin, input.shopId, rows.map((row) => row.id));

  return {
    assetHours: asset.engineHours,
    tree: buildComponentTree(
      rows.map((row) => mapComponentRow(row, asset.engineHours, events.get(row.id) ?? null)),
    ),
  };
}

function assetLabel(row: {
  unit_number: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}): string {
  const machine = [row.year, row.make, row.model].filter(Boolean).join(" ");
  if (row.unit_number && machine) return `Unit ${row.unit_number} · ${machine}`;
  return row.unit_number ? `Unit ${row.unit_number}` : machine || "Asset";
}

/**
 * A component with its full cross-machine history. For shop-wide roles only
 * (the route enforces this); asset names still come through the caller's RLS
 * client so nothing outside the caller's visibility is labelled.
 */
export async function loadComponentDetail(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  componentId: string;
}): Promise<EquipmentComponentDetail | null> {
  const { data: row, error } = await input.admin
    .from("equipment_components")
    .select(COMPONENT_COLUMNS)
    .eq("shop_id", input.shopId)
    .eq("id", input.componentId)
    .maybeSingle();
  if (error) throw new EquipmentComponentError("Unable to load component.", 500);
  if (!row) return null;
  const component = row as ComponentRow;

  const history: EventRow[] = [];
  for (let page = 0; page < 50; page += 1) {
    const { data, error: eventError } = await input.admin
      .from("equipment_component_events")
      .select(EVENT_COLUMNS)
      .eq("shop_id", input.shopId)
      .eq("component_id", input.componentId)
      .order("occurred_at", { ascending: false })
      .order("sequence", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (eventError) throw new EquipmentComponentError("Unable to load component history.", 500);
    history.push(...((data ?? []) as EventRow[]));
    if (!data || data.length < PAGE) break;
  }

  const assetIds = Array.from(
    new Set(
      [component.installed_vehicle_id, ...history.map((event) => event.vehicle_id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  );
  const assets = new Map<string, { label: string; engineHours: number | null }>();
  for (let offset = 0; offset < assetIds.length; offset += 100) {
    const { data, error: assetError } = await input.supabase
      .from("vehicles")
      .select("id,unit_number,year,make,model,engine_hours")
      .eq("shop_id", input.shopId)
      .in("id", assetIds.slice(offset, offset + 100));
    if (assetError) throw new EquipmentComponentError("Unable to load assets.", 500);
    for (const vehicle of data ?? []) {
      assets.set(vehicle.id, { label: assetLabel(vehicle), engineHours: vehicle.engine_hours });
    }
  }
  const assetRef = (id: string | null) =>
    id && assets.has(id) ? { id, label: assets.get(id)!.label, href: `/equipment/${id}` } : null;

  const current = component.installed_vehicle_id
    ? assets.get(component.installed_vehicle_id)
    : undefined;
  return {
    component: mapComponentRow(component, current?.engineHours ?? null, history.find((event) => !LIFECYCLE_EXCLUDED.has(event.event_type)) ?? null),
    asset: assetRef(component.installed_vehicle_id),
    history: history.map((event) => ({
      id: event.id,
      eventType: event.event_type as ComponentEventType,
      occurredAt: event.occurred_at,
      assetHours: event.asset_hours,
      componentHours: event.component_hours,
      notes: event.notes,
      asset: assetRef(event.vehicle_id),
      workOrderId: event.work_order_id,
      details: detailsOf(event.details),
    })),
  };
}

function fieldsPayload(fields: ComponentFields) {
  return {
    component_type: fields.componentType,
    position: fields.position,
    label: fields.label,
    manufacturer: fields.manufacturer,
    model: fields.model,
    serial_number: fields.serialNumber,
    part_number: fields.partNumber,
    attributes: fields.attributes,
  };
}

async function loadOwnedComponent(
  admin: SupabaseClient<DB>,
  shopId: string,
  componentId: string,
): Promise<ComponentRow> {
  const { data, error } = await admin
    .from("equipment_components")
    .select(COMPONENT_COLUMNS)
    .eq("shop_id", shopId)
    .eq("id", componentId)
    .maybeSingle();
  if (error) throw new EquipmentComponentError("Unable to load component.", 500);
  if (!data) throw new EquipmentComponentError("Component not found.", 404);
  return data as ComponentRow;
}

type WriteContext = {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  actorUserId: string;
};

async function requireAsset(context: WriteContext, assetId: string) {
  const asset = await authorizeEquipmentAsset({ ...context, assetId });
  if (!asset) throw new EquipmentComponentError("Asset not found.", 404);
  return asset;
}

export async function createComponent(
  context: WriteContext & {
    fields: ComponentFields;
    install: { assetId: string; parentComponentId: string | null } | null;
    operationKey: string;
  },
): Promise<string> {
  const asset = context.install ? await requireAsset(context, context.install.assetId) : null;

  // Create and install in one transaction; a retry with the same key returns
  // the original component.
  const { data: id, error } = await context.admin.rpc("equipment_component_save", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    // Positional SQL parameter: null means create (generated types omit nullability).
    p_component_id: null as unknown as string,
    p_fields: fieldsPayload(context.fields),
    p_install_vehicle_id: context.install?.assetId ?? undefined,
    p_parent_component_id: context.install?.parentComponentId ?? undefined,
    p_asset_hours: asset?.engineHours ?? undefined,
    p_operation_key: context.operationKey,
  });
  if (error) rpcFailure(error);
  return id as string;
}

export async function updateComponent(
  context: WriteContext & { componentId: string; fields: ComponentFields },
): Promise<void> {
  const existing = await loadOwnedComponent(context.admin, context.shopId, context.componentId);
  if (existing.installed_vehicle_id) await requireAsset(context, existing.installed_vehicle_id);
  const { error } = await context.admin.rpc("equipment_component_save", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_component_id: context.componentId,
    p_fields: fieldsPayload(context.fields),
  });
  if (error) rpcFailure(error);
}

/**
 * Install / remove / rebuild / repair / inspect / scrap a component.
 * Every asset touched (current and target) is authorized through the
 * caller's RLS client first; meters come from those authorized assets.
 * Assigned technicians may record work (rebuild/repair/inspect) on a
 * component installed on an asset they can see; moving and retiring
 * components stays with component managers.
 */
export async function applyComponentAction(
  context: WriteContext & { componentId: string; input: ComponentActionInput },
): Promise<void> {
  const { input } = context;
  const manager = canManageComponents(context.role);
  if (!manager && !isComponentWorkAction(input.action)) {
    throw new EquipmentComponentError("Your role cannot move or retire components.", 403);
  }

  const component = await loadOwnedComponent(context.admin, context.shopId, context.componentId);
  if (!manager && component.status !== "installed") {
    // Work on a component off the machine has no assigned asset to authorize.
    throw new EquipmentComponentError("Component not found.", 404);
  }
  if (input.action === "remove" && component.status !== "installed") {
    throw new EquipmentComponentError("This component is not installed on an asset.", 409);
  }

  const currentAsset = component.installed_vehicle_id
    ? await requireAsset(context, component.installed_vehicle_id)
    : null;
  const targetAsset =
    input.action === "install" && input.assetId ? await requireAsset(context, input.assetId) : null;
  // The asset the event is recorded on.
  const eventAsset = input.action === "install" ? targetAsset : currentAsset;

  if (input.workOrderId) {
    const { data: workOrder, error } = await context.supabase
      .from("work_orders")
      .select("id,vehicle_id")
      .eq("shop_id", context.shopId)
      .eq("id", input.workOrderId)
      .maybeSingle();
    if (error) throw new EquipmentComponentError("Unable to load work order.", 500);
    if (!workOrder) throw new EquipmentComponentError("Work order not found.", 400);
    if (eventAsset && workOrder.vehicle_id !== eventAsset.id) {
      throw new EquipmentComponentError("That work order is for a different asset.", 400);
    }
  }

  const movingAssets =
    input.action === "install" &&
    currentAsset !== null &&
    targetAsset !== null &&
    currentAsset.id !== targetAsset.id;

  const { error } = await context.admin.rpc("equipment_component_move", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_component_id: context.componentId,
    p_action: input.action,
    p_vehicle_id: input.action === "install" ? input.assetId ?? undefined : undefined,
    p_parent_component_id: input.parentComponentId ?? undefined,
    p_position: input.position ?? undefined,
    p_asset_hours: eventAsset?.engineHours ?? undefined,
    // Life accrued on the old asset is measured with the old asset's meter.
    p_source_asset_hours: movingAssets ? currentAsset!.engineHours ?? undefined : undefined,
    p_occurred_at: input.occurredAt ?? undefined,
    p_work_order_id: input.workOrderId ?? undefined,
    p_notes: input.notes ?? undefined,
    p_target_status: input.action === "remove" ? input.targetStatus : undefined,
    p_operation_key: input.operationKey,
  });
  if (error) rpcFailure(error);
}

/** Add the standard component hierarchy for the asset's Equipment class (idempotent). */
export async function seedStandardComponents(
  context: WriteContext & { assetId: string },
): Promise<number> {
  const asset = await requireAsset(context, context.assetId);
  const { data: profile, error: profileError } = await context.admin
    .from("equipment_asset_profiles")
    .select("equipment_class")
    .eq("shop_id", context.shopId)
    .eq("vehicle_id", context.assetId)
    .maybeSingle();
  if (profileError) throw new EquipmentComponentError("Unable to load Equipment profile.", 500);
  if (!profile) {
    throw new EquipmentComponentError("Set up the Equipment profile before adding components.", 409);
  }

  const items = componentTemplateForClass(profile.equipment_class).map((item) => ({
    key: item.key,
    parent_key: item.parentKey,
    component_type: item.componentType,
    position: item.position,
    label: componentLabel(item.componentType, item.position),
  }));
  if (!items.length) return 0;

  const { data, error } = await context.admin.rpc("equipment_component_seed", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_vehicle_id: context.assetId,
    p_items: items,
    p_asset_hours: asset.engineHours ?? undefined,
  });
  if (error) rpcFailure(error);
  return Number(data ?? 0);
}
