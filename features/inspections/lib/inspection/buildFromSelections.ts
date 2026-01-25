// features/inspections/lib/inspection/buildFromSelections.ts

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

    // IMPORTANT: status + notes must exist for StatusButtons + fail/recommend flows
    status: args.status ?? null,
    notes: args.notes ?? "",

    // value can be null initially
    value: args.value ?? null,
  } as InspectionItem;
}

function buildTireGridSection(vt: VehicleType): InspectionCategory | null {
  /**
   * You said:
   * - Tire grid is TIRES ONLY (no brake items)
   * - Hydraulic should default to dual rear capability
   *   (rear gets Inner/Outer TP + TD items by default; front stays single)
   */

  // Hydraulic (car): corners LF/RF/LR/RR
  if (vt === "car") {
    const items: InspectionItem[] = [];

    // FRONT (single)
    for (const c of ["LF", "RF"] as const) {
      items.push(mkItem({ item: `${c} Tire Pressure`, unit: "psi" }));
      items.push(mkItem({ item: `${c} Tread Depth (Outer)`, unit: "mm" }));
      // no front inner by default (single tires)
    }

    // REAR (dual-capable by default)
    for (const c of ["LR", "RR"] as const) {
      // TP dual default
      items.push(mkItem({ item: `${c} Tire Pressure (Outer)`, unit: "psi" }));
      items.push(mkItem({ item: `${c} Tire Pressure (Inner)`, unit: "psi" }));

      // TD dual default
      items.push(mkItem({ item: `${c} Tread Depth (Outer)`, unit: "mm" }));
      items.push(mkItem({ item: `${c} Tread Depth (Inner)`, unit: "mm" }));
    }

    if (!items.length) return null;
    return { title: "Tire Grid", items };
  }

  // Air brake vehicles: build from axle layout (Steer/Drive/etc)
  const layout = generateAxleLayout(vt);

  const items: InspectionItem[] = [];
  for (const a of layout) {
    const isSteer = a.axleLabel.toLowerCase().startsWith("steer");

    for (const side of ["Left", "Right"] as const) {
      if (isSteer) {
        // Steer is single
        items.push(mkItem({ item: `${a.axleLabel} ${side} Tire Pressure`, unit: "psi" }));
        items.push(mkItem({ item: `${a.axleLabel} ${side} Tread Depth`, unit: "mm" }));
      } else {
        // Non-steer axles are dual-capable by default
        items.push(mkItem({ item: `${a.axleLabel} ${side} Tire Pressure (Outer)`, unit: "psi" }));
        items.push(mkItem({ item: `${a.axleLabel} ${side} Tire Pressure (Inner)`, unit: "psi" }));
        items.push(mkItem({ item: `${a.axleLabel} ${side} Tread Depth (Outer)`, unit: "mm" }));
        items.push(mkItem({ item: `${a.axleLabel} ${side} Tread Depth (Inner)`, unit: "mm" }));
      }
    }
  }

  if (!items.length) return null;
  return { title: "Tire Grid", items };
}

/**
 * IMPORTANT:
 * - Corner grids are BRAKES/torque/push-rod ONLY.
 * - Tires live in the dedicated Tire Grid.
 * - Every generated item must include status + notes defaults (for StatusButtons + fail/recommend flows).
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

    // Always add Tire Grid when axle mode is enabled (TIRES ONLY)
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