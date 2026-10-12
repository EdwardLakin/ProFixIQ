import {
  offRoadProfileByValue,
  type OffRoadEquipmentFamily,
} from "@/features/inspections/lib/inspection/offRoadInspectionCatalog";

/**
 * Equipment component vocabulary.
 *
 * Components (engines, final drives, pumps, undercarriage, ...) carry their
 * own identity and history because they are rebuilt and swapped between
 * machines. Attachments that move between machines as whole units (buckets,
 * forks, breakers) are modelled as assets mounted on a host asset instead.
 */

export const COMPONENT_TYPE_LABELS = {
  engine: "Engine",
  turbocharger: "Turbocharger",
  aftertreatment: "Aftertreatment / DPF",
  cooling_system: "Cooling system",
  transmission: "Transmission",
  torque_converter: "Torque converter",
  hydraulic_system: "Hydraulic system",
  main_hydraulic_pump: "Main hydraulic pump",
  pilot_pump: "Pilot pump",
  control_valve: "Main control valve",
  swing_drive: "Swing drive",
  swing_motor: "Swing motor",
  swing_bearing: "Swing bearing",
  travel_motor: "Travel motor",
  final_drive: "Final drive",
  undercarriage: "Undercarriage",
  track_chain: "Track chain / links",
  track_shoes: "Track shoes",
  track_rollers: "Track rollers",
  carrier_rollers: "Carrier rollers",
  idler: "Front idler",
  sprocket: "Sprocket",
  axle: "Axle",
  differential: "Differential",
  suspension: "Suspension",
  steering: "Steering system",
  brakes: "Brakes",
  boom: "Boom",
  stick: "Stick / arm",
  lift_arms: "Lift arms / loader linkage",
  blade: "Blade",
  ripper: "Ripper",
  mast: "Mast",
  dump_body: "Dump body",
  hoist_cylinders: "Hoist cylinders",
  hydraulic_cylinder: "Hydraulic cylinder",
  drum: "Drum",
  electrical_system: "Electrical system",
  alternator: "Alternator",
  starter: "Starter",
  cab_rops: "Cab / ROPS",
  other: "Other component",
} as const;

export type ComponentType = keyof typeof COMPONENT_TYPE_LABELS;
export const COMPONENT_TYPES = Object.keys(COMPONENT_TYPE_LABELS) as ComponentType[];

export const COMPONENT_POSITION_LABELS = {
  left: "Left",
  right: "Right",
  front: "Front",
  rear: "Rear",
  front_left: "Front left",
  front_right: "Front right",
  rear_left: "Rear left",
  rear_right: "Rear right",
  center: "Center",
  upper: "Upper",
  lower: "Lower",
  primary: "Primary",
  secondary: "Secondary",
} as const;
export type ComponentPosition = keyof typeof COMPONENT_POSITION_LABELS;
export const COMPONENT_POSITIONS = Object.keys(COMPONENT_POSITION_LABELS) as ComponentPosition[];

export const COMPONENT_STATUSES = ["installed", "in_stock", "in_repair", "scrapped"] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];
export const COMPONENT_STATUS_LABELS: Record<ComponentStatus, string> = {
  installed: "Installed",
  in_stock: "In stock",
  in_repair: "In repair / rebuild",
  scrapped: "Scrapped",
};

export const COMPONENT_EVENT_LABELS = {
  created: "Created",
  installed: "Installed",
  removed: "Removed",
  rebuilt: "Rebuilt",
  repaired: "Repaired",
  inspected: "Inspected",
  scrapped: "Scrapped",
} as const;
export type ComponentEventType = keyof typeof COMPONENT_EVENT_LABELS;

export const COMPONENT_ACTIONS = [
  "install",
  "remove",
  "rebuilt",
  "repaired",
  "inspected",
  "scrapped",
] as const;
export type ComponentAction = (typeof COMPONENT_ACTIONS)[number];

export function componentLabel(type: string, position: string | null): string {
  const base = COMPONENT_TYPE_LABELS[type as ComponentType] ?? type;
  const side = position
    ? COMPONENT_POSITION_LABELS[position as ComponentPosition] ?? position
    : null;
  return side ? `${base} — ${side}` : base;
}

// ---------------------------------------------------------------------------
// Standard hierarchies (starting points; shops add/remove as needed)
// ---------------------------------------------------------------------------

export type ComponentTemplateItem = {
  key: string;
  parentKey: string | null;
  componentType: ComponentType;
  position: ComponentPosition | null;
};

type TemplateNode = [ComponentType, ComponentPosition | null, TemplateNode[]?];

function flatten(nodes: TemplateNode[], parentKey: string | null = null): ComponentTemplateItem[] {
  return nodes.flatMap(([componentType, position, children]) => {
    const key = [parentKey, componentType, position].filter(Boolean).join(".");
    return [
      { key, parentKey, componentType, position },
      ...flatten(children ?? [], key),
    ];
  });
}

const ENGINE: TemplateNode = ["engine", null, [["turbocharger", null], ["aftertreatment", null], ["cooling_system", null]]];
const ELECTRICAL: TemplateNode = ["electrical_system", null, [["alternator", null], ["starter", null]]];
const UNDERCARRIAGE_SIDE = (position: ComponentPosition): TemplateNode => [
  "undercarriage",
  position,
  [
    ["track_chain", position],
    ["track_shoes", position],
    ["track_rollers", position],
    ["carrier_rollers", position],
    ["idler", position],
    ["sprocket", position],
  ],
];

const FAMILY_TEMPLATES: Partial<Record<OffRoadEquipmentFamily, TemplateNode[]>> = {
  excavation: [
    ENGINE,
    ["hydraulic_system", null, [["main_hydraulic_pump", null], ["pilot_pump", null], ["control_valve", null]]],
    ["swing_drive", null, [["swing_motor", null], ["swing_bearing", null]]],
    ["final_drive", "left", [["travel_motor", "left"]]],
    ["final_drive", "right", [["travel_motor", "right"]]],
    UNDERCARRIAGE_SIDE("left"),
    UNDERCARRIAGE_SIDE("right"),
    ["boom", null],
    ["stick", null],
    ELECTRICAL,
  ],
  loading: [
    ENGINE,
    ["transmission", null, [["torque_converter", null]]],
    ["axle", "front", [["differential", "front"]]],
    ["axle", "rear", [["differential", "rear"]]],
    ["hydraulic_system", null, [["main_hydraulic_pump", null], ["control_valve", null]]],
    ["lift_arms", null],
    ["brakes", null],
    ["steering", null],
    ELECTRICAL,
  ],
  dozing_grading: [
    ENGINE,
    ["transmission", null, [["torque_converter", null]]],
    ["final_drive", "left"],
    ["final_drive", "right"],
    UNDERCARRIAGE_SIDE("left"),
    UNDERCARRIAGE_SIDE("right"),
    ["hydraulic_system", null, [["main_hydraulic_pump", null]]],
    ["blade", null],
    ["ripper", null],
    ELECTRICAL,
  ],
  hauling: [
    ENGINE,
    ["transmission", null, [["torque_converter", null]]],
    ["axle", "front", [["differential", "front"]]],
    ["axle", "rear", [["differential", "rear"]]],
    ["suspension", null],
    ["steering", null],
    ["brakes", null],
    ["dump_body", null, [["hoist_cylinders", null]]],
    ELECTRICAL,
  ],
  material_handling: [
    ENGINE,
    ["transmission", null],
    ["axle", "front"],
    ["axle", "rear"],
    ["hydraulic_system", null, [["main_hydraulic_pump", null]]],
    ["mast", null],
    ["brakes", null],
    ["steering", null],
    ELECTRICAL,
  ],
  compaction: [
    ENGINE,
    ["hydraulic_system", null, [["main_hydraulic_pump", null]]],
    ["drum", "front"],
    ["axle", "rear"],
    ELECTRICAL,
  ],
};

const DEFAULT_TEMPLATE: TemplateNode[] = [
  ENGINE,
  ["hydraulic_system", null, [["main_hydraulic_pump", null]]],
  ELECTRICAL,
];

/** Standard component hierarchy for an equipment class (parents before children). */
export function componentTemplateForClass(equipmentClass: string | null): ComponentTemplateItem[] {
  const profile = offRoadProfileByValue(equipmentClass);
  if (profile?.family === "attachments") return [];
  const family = profile?.family;
  const tracked = profile
    ? ["crawler_excavator", "mini_excavator", "compact_track_loader", "crawler_dozer"].includes(profile.value)
    : false;
  let nodes = (family && FAMILY_TEMPLATES[family]) || DEFAULT_TEMPLATE;
  // Wheeled machines in tracked families do not get undercarriage.
  if (!tracked && family && (family === "excavation" || family === "dozing_grading")) {
    nodes = nodes.filter(([type]) => type !== "undercarriage");
  }
  return flatten(nodes);
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type EquipmentComponentEvent = {
  id: string;
  eventType: ComponentEventType;
  occurredAt: string;
  assetHours: number | null;
  componentHours: number | null;
  notes: string | null;
  /** Asset at the time, when the viewer may see it. */
  asset: { id: string; label: string; href: string } | null;
  workOrderId: string | null;
};

export type EquipmentComponent = {
  id: string;
  componentType: string;
  position: string | null;
  label: string;
  displayName: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  partNumber: string | null;
  status: ComponentStatus;
  installedAssetId: string | null;
  parentComponentId: string | null;
  installedAt: string | null;
  /** Component life in hours, when meters allow it (life at install + asset hours since). */
  componentHours: number | null;
  attributes: Record<string, string | number | boolean | null>;
  lastEvent: { eventType: ComponentEventType; occurredAt: string } | null;
};

export type EquipmentComponentDetail = {
  component: EquipmentComponent;
  /** Current asset, when installed and visible to the viewer. */
  asset: { id: string; label: string; href: string } | null;
  history: EquipmentComponentEvent[];
};

export type EquipmentComponentNode = EquipmentComponent & {
  children: EquipmentComponentNode[];
};

export function buildComponentTree(components: EquipmentComponent[]): EquipmentComponentNode[] {
  const nodes = new Map<string, EquipmentComponentNode>(
    components.map((component) => [component.id, { ...component, children: [] }]),
  );
  const roots: EquipmentComponentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentComponentId ? nodes.get(node.parentComponentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const order = (a: EquipmentComponentNode, b: EquipmentComponentNode) =>
    a.displayName.localeCompare(b.displayName);
  const sortDeep = (list: EquipmentComponentNode[]) => {
    list.sort(order);
    for (const node of list) sortDeep(node.children);
  };
  sortDeep(roots);
  return roots;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTRIBUTE_KEY = /^[a-z][a-z0-9_]{0,63}$/;

export function isComponentId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function text(value: unknown, field: string, max: number): Validation<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false, error: `${field} must be ${max} characters or fewer.` };
  return { ok: true, value: trimmed || null };
}

export type ComponentFields = {
  componentType: ComponentType;
  position: ComponentPosition | null;
  label: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  partNumber: string | null;
  attributes: Record<string, string | number | boolean | null>;
};

export function validateComponentFields(body: unknown): Validation<ComponentFields> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "A component body is required." };
  }
  const input = body as Record<string, unknown>;
  if (typeof input.componentType !== "string" || !(input.componentType in COMPONENT_TYPE_LABELS)) {
    return { ok: false, error: "Select a recognized component type." };
  }
  const componentType = input.componentType as ComponentType;
  let position: ComponentPosition | null = null;
  if (input.position !== undefined && input.position !== null && input.position !== "") {
    if (typeof input.position !== "string" || !(input.position in COMPONENT_POSITION_LABELS)) {
      return { ok: false, error: "Select a recognized position." };
    }
    position = input.position as ComponentPosition;
  }
  const fields = {
    label: text(input.label, "Name", 120),
    manufacturer: text(input.manufacturer, "Manufacturer", 120),
    model: text(input.model, "Model", 120),
    serialNumber: text(input.serialNumber, "Serial number", 120),
    partNumber: text(input.partNumber, "Part number", 120),
  };
  for (const result of Object.values(fields)) if (!result.ok) return result;
  const get = (result: Validation<string | null>) => (result.ok ? result.value : null);

  const attributes: ComponentFields["attributes"] = {};
  if (input.attributes !== undefined && input.attributes !== null) {
    if (typeof input.attributes !== "object" || Array.isArray(input.attributes)) {
      return { ok: false, error: "Attributes must be an object." };
    }
    const entries = Object.entries(input.attributes as Record<string, unknown>);
    if (entries.length > 50) return { ok: false, error: "Up to 50 attributes are supported." };
    for (const [key, value] of entries) {
      if (!ATTRIBUTE_KEY.test(key)) return { ok: false, error: `Attribute "${key}" has an invalid name.` };
      if (
        value === null ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && value.length <= 500)
      ) {
        attributes[key] = value as string | number | boolean | null;
      } else {
        return { ok: false, error: `Attribute "${key}" must be text, a number or yes/no.` };
      }
    }
  }

  return {
    ok: true,
    value: {
      componentType,
      position,
      label: get(fields.label) ?? componentLabel(componentType, position),
      manufacturer: get(fields.manufacturer),
      model: get(fields.model),
      serialNumber: get(fields.serialNumber),
      partNumber: get(fields.partNumber),
      attributes,
    },
  };
}

export type ComponentActionInput = {
  action: ComponentAction;
  assetId: string | null;
  parentComponentId: string | null;
  position: ComponentPosition | null;
  occurredAt: string | null;
  workOrderId: string | null;
  notes: string | null;
  targetStatus: "in_stock" | "in_repair";
};

export function validateComponentAction(body: unknown): Validation<ComponentActionInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "An action body is required." };
  }
  const input = body as Record<string, unknown>;
  if (typeof input.action !== "string" || !(COMPONENT_ACTIONS as readonly string[]).includes(input.action)) {
    return { ok: false, error: "Select a recognized action." };
  }
  const action = input.action as ComponentAction;

  const optionalId = (value: unknown, field: string): Validation<string | null> => {
    if (value === undefined || value === null || value === "") return { ok: true, value: null };
    return isComponentId(value) ? { ok: true, value } : { ok: false, error: `${field} is invalid.` };
  };
  const assetId = optionalId(input.assetId, "Asset");
  if (!assetId.ok) return assetId;
  const parentComponentId = optionalId(input.parentComponentId, "Parent component");
  if (!parentComponentId.ok) return parentComponentId;
  const workOrderId = optionalId(input.workOrderId, "Work order");
  if (!workOrderId.ok) return workOrderId;
  if (action === "install" && !assetId.value) {
    return { ok: false, error: "Choose the asset to install this component on." };
  }

  let position: ComponentPosition | null = null;
  if (input.position !== undefined && input.position !== null && input.position !== "") {
    if (typeof input.position !== "string" || !(input.position in COMPONENT_POSITION_LABELS)) {
      return { ok: false, error: "Select a recognized position." };
    }
    position = input.position as ComponentPosition;
  }

  let occurredAt: string | null = null;
  if (input.occurredAt !== undefined && input.occurredAt !== null && input.occurredAt !== "") {
    const parsed = typeof input.occurredAt === "string" ? Date.parse(input.occurredAt) : NaN;
    if (!Number.isFinite(parsed)) return { ok: false, error: "Date is invalid." };
    if (parsed > Date.now() + 24 * 60 * 60 * 1000) {
      return { ok: false, error: "Date cannot be in the future." };
    }
    occurredAt = new Date(parsed).toISOString();
  }

  const notes = text(input.notes, "Notes", 2000);
  if (!notes.ok) return notes;

  return {
    ok: true,
    value: {
      action,
      assetId: assetId.value,
      parentComponentId: parentComponentId.value,
      position,
      occurredAt,
      workOrderId: workOrderId.value,
      notes: notes.value,
      targetStatus: input.targetStatus === "in_repair" ? "in_repair" : "in_stock",
    },
  };
}
