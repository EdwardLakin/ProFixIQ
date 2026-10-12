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
  "id,shop_id,component_id,event_type,vehicle_id,asset_hours,component_hours,occurred_at,work_order_id,notes,recorded_by,created_at";
const PAGE = 1_000;

export class EquipmentComponentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 500,
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
        .neq("event_type", "created")
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
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
      .order("id", { ascending: false })
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
    component: mapComponentRow(component, current?.engineHours ?? null, history.find((event) => event.event_type !== "created") ?? null),
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
  },
): Promise<string> {
  if (context.install) {
    await requireAsset(context, context.install.assetId);
    // Check the parent up front so a rejected install cannot leave an
    // orphaned in-stock component behind.
    if (context.install.parentComponentId) {
      const parent = await loadOwnedComponent(
        context.admin,
        context.shopId,
        context.install.parentComponentId,
      ).catch((error: unknown) => {
        if (error instanceof EquipmentComponentError && error.status === 404) return null;
        throw error;
      });
      if (!parent || parent.installed_vehicle_id !== context.install.assetId) {
        throw new EquipmentComponentError(
          "The parent component must be installed on the same asset.",
          409,
        );
      }
    }
  }

  const { data: id, error } = await context.admin.rpc("equipment_component_save", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    // Positional SQL parameter: null means create (generated types omit nullability).
    p_component_id: null as unknown as string,
    p_fields: fieldsPayload(context.fields),
  });
  if (error) rpcFailure(error);
  const componentId = id as string;

  if (context.install) {
    await applyComponentAction({
      ...context,
      componentId,
      input: {
        action: "install",
        assetId: context.install.assetId,
        parentComponentId: context.install.parentComponentId,
        position: context.fields.position,
        occurredAt: null,
        workOrderId: null,
        notes: null,
        targetStatus: "in_stock",
      },
    });
  }
  return componentId;
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
 */
export async function applyComponentAction(
  context: WriteContext & { componentId: string; input: ComponentActionInput },
): Promise<void> {
  const { input } = context;
  const component = await loadOwnedComponent(context.admin, context.shopId, context.componentId);

  if (input.action === "remove" && component.status !== "installed") {
    throw new EquipmentComponentError("This component is not installed on an asset.", 409);
  }

  const currentAsset = component.installed_vehicle_id
    ? await requireAsset(context, component.installed_vehicle_id)
    : null;
  const targetAsset =
    input.action === "install" && input.assetId ? await requireAsset(context, input.assetId) : null;

  if (input.workOrderId) {
    const { data: workOrder, error } = await context.supabase
      .from("work_orders")
      .select("id")
      .eq("shop_id", context.shopId)
      .eq("id", input.workOrderId)
      .maybeSingle();
    if (error) throw new EquipmentComponentError("Unable to load work order.", 500);
    if (!workOrder) throw new EquipmentComponentError("Work order not found.", 400);
  }

  const movingAssets =
    input.action === "install" &&
    currentAsset !== null &&
    targetAsset !== null &&
    currentAsset.id !== targetAsset.id;
  // Life accrued on the old asset, measured with the old asset's own meter.
  const componentHoursOnLeave = movingAssets
    ? componentHours(component, currentAsset!.engineHours)
    : null;

  const assetHours =
    input.action === "install"
      ? targetAsset?.engineHours ?? null
      : currentAsset?.engineHours ?? null;

  const { error } = await context.admin.rpc("equipment_component_move", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_component_id: context.componentId,
    p_action: input.action,
    p_vehicle_id: input.action === "install" ? input.assetId ?? undefined : undefined,
    p_parent_component_id: input.parentComponentId ?? undefined,
    p_position: input.position ?? undefined,
    p_asset_hours: assetHours ?? undefined,
    p_component_hours: componentHoursOnLeave ?? undefined,
    p_occurred_at: input.occurredAt ?? undefined,
    p_work_order_id: input.workOrderId ?? undefined,
    p_notes: input.notes ?? undefined,
    p_target_status: input.action === "remove" ? input.targetStatus : undefined,
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
