import type {
  InspectionCategory,
  InspectionItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";
import { generateAxleLayout } from "@inspections/lib/inspection/generateAxleLayout";

type VehicleType = "car" | "truck" | "bus" | "trailer";

type BuildParams = {
  // keyed by section title -> item strings chosen
  selections: Record<string, string[]>;
  // when present, prepend a corner/axle section built from the vehicle type
  axle?: { vehicleType: VehicleType } | null;
  // optionally seed extra items from your master services (simple names)
  extraServiceItems?: string[];
};

function mkItem(args: {
  item: string;
  unit?: string | null;
  value?: string | number | null;
  status?: InspectionItemStatus | null;
  notes?: string | null;
}): InspectionItem {
  return {
    item: args.item,
    unit: args.unit ?? null,

    // ✅ keep status/notes present so StatusButtons + fail/recommend flows work
    status: (args.status ?? "na") as InspectionItemStatus,
    notes: args.notes ?? "",

    value: args.value ?? null,
  } as InspectionItem;
}

function buildTireGridSection(vt: VehicleType): InspectionCategory | null {
  /**
   * Canonical rules for TireGrid parsing:
   * - AIR: "<Axle> <Left|Right> Tire Pressure", "<Axle> <Left|Right> Tread Depth" (Steer single)
   * - AIR dual: include "(Outer)/(Inner)" only for non-steer axles
   * - HYD: "LF|RF|LR|RR <Metric>" labels
   * - StatusButtons require either:
   *    - per-side "Tire Condition" items, OR
   *    - row-level "<Axle> Tire Status" (this file adds row-level)
   */

  // HYDRAULIC (car): corners LF/RF/LR/RR
  if (vt === "car") {
    const items: InspectionItem[] = [];

    // FRONT (single tires)
    for (const c of ["LF", "RF"] as const) {
      items.push(mkItem({ item: `${c} Tire Pressure`, unit: "psi" }));
      items.push(mkItem({ item: `${c} Tread Depth (Outer)`, unit: "mm" }));
      // no inner by default (single)
    }

    // REAR (dual-capable by default)
    for (const c of ["LR", "RR"] as const) {
      items.push(mkItem({ item: `${c} Tire Pressure (Outer)`, unit: "psi" }));
      items.push(mkItem({ item: `${c} Tire Pressure (Inner)`, unit: "psi" }));
      items.push(mkItem({ item: `${c} Tread Depth (Outer)`, unit: "mm" }));
      items.push(mkItem({ item: `${c} Tread Depth (Inner)`, unit: "mm" }));
    }

    // ✅ Row-level status carriers so TireGrid renders StatusButtons (fallback path)
    // TireGrid maps corners -> Steer 1 (LF/RF) and Rear 1 (LR/RR)
    items.push(mkItem({ item: "Steer 1 Tire Status", unit: null }));
    items.push(mkItem({ item: "Rear 1 Tire Status", unit: null }));

    return items.length ? { title: "Tire Grid – Hydraulic", items } : null;
  }

  // AIR BRAKE vehicles: build from axle layout
  const layout = generateAxleLayout(vt);

  const items: InspectionItem[] = [];

  for (const a of layout) {
    const axleLabel = a.axleLabel;
    const isSteer = axleLabel.toLowerCase().startsWith("steer");

    // ✅ Row-level status carrier for each axle
    items.push(mkItem({ item: `${axleLabel} Tire Status`, unit: null }));

    for (const side of ["Left", "Right"] as const) {
      if (isSteer) {
        // Steer is single
        items.push(mkItem({ item: `${axleLabel} ${side} Tire Pressure`, unit: "psi" }));
        items.push(mkItem({ item: `${axleLabel} ${side} Tread Depth`, unit: "mm" }));
      } else {
        // Non-steer axles are dual-capable by default
        items.push(mkItem({ item: `${axleLabel} ${side} Tire Pressure (Outer)`, unit: "psi" }));
        items.push(mkItem({ item: `${axleLabel} ${side} Tire Pressure (Inner)`, unit: "psi" }));
        items.push(mkItem({ item: `${axleLabel} ${side} Tread Depth (Outer)`, unit: "mm" }));
        items.push(mkItem({ item: `${axleLabel} ${side} Tread Depth (Inner)`, unit: "mm" }));
      }
    }
  }

  return items.length ? { title: "Tire Grid – Air Brake", items } : null;
}

/**
 * IMPORTANT:
 * - Corner grids are BRAKES/torque/push-rod ONLY.
 * - Tires live in the dedicated Tire Grid.
 * - Every generated item must include status + notes defaults.
 */
export function buildInspectionFromSelections({
  selections,
  axle,
  extraServiceItems = [],
}: BuildParams): InspectionCategory[] {
  const sections: InspectionCategory[] = [];

  // 1) Corner/Axle block first (BRAKES ONLY) + Tire Grid (TIRES ONLY)
  if (axle) {
    const vt = axle.vehicleType;
    const layout = generateAxleLayout(vt);

    if (vt === "car") {
      // HYDRAULIC CORNER GRID — brakes/torque only (NO tires here)
      const corners = [
        { key: "LF", title: "LF" },
        { key: "RF", title: "RF" },
        { key: "LR", title: "LR" },
        { key: "RR", title: "RR" },
      ] as const;

      const metrics: Array<{ label: string; unit: string | null }> = [
        { label: "Brake Pad", unit: "mm" },
        { label: "Rotor", unit: "mm" },
        { label: "Rotor Condition", unit: null },
        { label: "Rotor Thickness", unit: "mm" },
        { label: "Wheel Torque", unit: "ft·lb" },
      ];

      const items: InspectionItem[] = [];
      for (const c of corners) {
        for (const m of metrics) {
          items.push(mkItem({ item: `${c.title} ${m.label}`, unit: m.unit }));
        }
      }

      if (items.length) {
        sections.push({
          title: "Corner Grid (Hydraulic)",
          items,
        });
      }
    } else {
      // AIR CORNER GRID — brakes/torque/push-rod only (NO tires here)
      const metrics: Array<{ label: string; unit: string | null }> = [
        { label: "Lining/Shoe", unit: "mm" },
        { label: "Drum/Rotor", unit: "mm" },
        { label: "Push Rod Travel", unit: "in" },
        { label: "Wheel Torque Outer", unit: "ft·lb" },
        { label: "Wheel Torque Inner", unit: "ft·lb" },
      ];

      const items: InspectionItem[] = [];
      for (const a of layout) {
        for (const side of ["Left", "Right"] as const) {
          for (const m of metrics) {
            items.push(
              mkItem({
                item: `${a.axleLabel} ${side} ${m.label}`,
                unit: m.unit,
              }),
            );
          }
        }
      }

      if (items.length) {
        sections.push({
          title: "Corner Grid (Air)",
          items,
        });
      }
    }

    // ✅ Add Tire Grid when axle mode is enabled (TIRES ONLY + Tire Status carriers)
    const tireGrid = buildTireGridSection(vt);
    if (tireGrid) sections.push(tireGrid);
  }

  // 2) Selected content from masterInspectionList
  for (const sec of masterInspectionList) {
    const picked = selections[sec.title];
    if (!picked || picked.length === 0) continue;

    const items: InspectionItem[] = sec.items
      .filter((i) => picked.includes(i.item))
      .map((i) =>
        mkItem({
          item: i.item,
          unit: i.unit ?? null,
        }),
      );

    if (items.length) sections.push({ title: sec.title, items });
  }

  // 3) Optional service items (as a “Services” section)
  if (extraServiceItems.length) {
    sections.push({
      title: "Services",
      items: extraServiceItems.map((name) =>
        mkItem({
          item: name,
          unit: null,
        }),
      ),
    });
  }

  return sections;
}