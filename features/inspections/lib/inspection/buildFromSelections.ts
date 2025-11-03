// features/inspections/lib/inspection/buildFromSelections.ts
import type { InspectionCategory, InspectionItem } from "@inspections/lib/inspection/types";
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

export function buildInspectionFromSelections({
  selections,
  axle,
  extraServiceItems = [],
}: BuildParams): InspectionCategory[] {
  const sections: InspectionCategory[] = [];

  // 1) Corner/Axle block first
  if (axle) {
    const vt = axle.vehicleType;
    const layout = generateAxleLayout(vt);

    if (vt === "car") {
      // HYDRAULIC GRID — emit LF/RF/LR/RR (or "Left Front ..." etc).
      // Using LF/RF/LR/RR to be maximally compatible with your CornerGrid regex.
      const corners = [
        { key: "LF", title: "LF" },
        { key: "RF", title: "RF" },
        { key: "LR", title: "LR" },
        { key: "RR", title: "RR" },
      ] as const;

      // Match your CornerGrid metric expectations/order
      const metrics: Array<{ label: string; unit: string | null }> = [
        { label: "Tire Pressure", unit: "psi" },
        { label: "Tire Tread", unit: "mm" },
        { label: "Brake Pad", unit: "mm" },
        { label: "Rotor", unit: "mm" },
        { label: "Rotor Condition", unit: null },
        { label: "Rotor Thickness", unit: "mm" },
        { label: "Wheel Torque", unit: "ft·lb" },
      ];

      const items: InspectionItem[] = [];
      for (const c of corners) {
        for (const m of metrics) {
          items.push({ item: `${c.title} ${m.label}`, unit: m.unit });
        }
      }

      sections.push({
        title: "Corner Grid (Hydraulic)",
        items,
      });
    } else {
      // AIR GRID — emit "<AxleLabel> Left/Right <Metric>"
      // Your AirCornerGrid will split duals (Outer/Inner) as needed.
      const metrics: Array<{ label: string; unit: string | null }> = [
        { label: "Tire Pressure", unit: "psi" },
        { label: "Tread Depth", unit: "mm" },
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
            // For hydraulic trailers you won't hit this branch; vt !== "car" here is air.
            // Units can be refined by your unitHint in the renderer.
            items.push({ item: `${a.axleLabel} ${side} ${m.label}`, unit: m.unit });
          }
        }
      }

      sections.push({
        title: "Corner Grid (Air)",
        items,
      });
    }
  }

  // 2) Selected content from masterInspectionList
  for (const sec of masterInspectionList) {
    const picked = selections[sec.title];
    if (!picked || picked.length === 0) continue;

    const items: InspectionItem[] = sec.items
      .filter((i) => picked.includes(i.item))
      .map((i) => ({ item: i.item }));

    if (items.length) sections.push({ title: sec.title, items });
  }

  // 3) Optional service items (as a “Services” section)
  if (extraServiceItems.length) {
    sections.push({
      title: "Services",
      items: extraServiceItems.map((name) => ({ item: name })),
    });
  }

  return sections;
}
