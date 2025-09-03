// features/inspections/lib/inspection/buildFromSelections.ts
import type { InspectionCategory, InspectionItem } from "@inspections/lib/inspection/types";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";
import { generateAxleLayout } from "@inspections/lib/inspection/generateAxleLayout";

type BuildParams = {
  // keyed by section title -> item strings chosen
  selections: Record<string, string[]>;
  // inject CVIP-style axle block first
  axle?: { vehicleType: "car" | "truck" | "bus" | "trailer" } | null;
  // optionally seed extra items from your master services (simple names)
  extraServiceItems?: string[];
};

export function buildInspectionFromSelections({
  selections,
  axle,
  extraServiceItems = [],
}: BuildParams): InspectionCategory[] {
  const sections: InspectionCategory[] = [];

  // 1) Axle block first (as a single section called "Axles")
  if (axle) {
    const axles = generateAxleLayout(axle.vehicleType);
    const axleItems: InspectionItem[] = [];

    for (const a of axles) {
      axleItems.push(
        { item: `${a.axleLabel} Left Tread Depth`,  unit: "mm" },
        { item: `${a.axleLabel} Right Tread Depth`, unit: "mm" },
        { item: `${a.axleLabel} Left Tire Pressure`,  unit: "psi" },
        { item: `${a.axleLabel} Right Tire Pressure`, unit: "psi" },
        { item: `${a.axleLabel} Left Lining Thickness`,  unit: "mm" },
        { item: `${a.axleLabel} Right Lining Thickness`, unit: "mm" },
        { item: `${a.axleLabel} Wheel Torque`, unit: "ft lbs" },
      );
      if (a.brakeType === "air") {
        axleItems.push(
          { item: `${a.axleLabel} Left Push Rod Travel`,  unit: "in" },
          { item: `${a.axleLabel} Right Push Rod Travel`, unit: "in" },
        );
      }
    }

    sections.push({ title: "Axles", items: axleItems });
  }

  // 2) Selected content from masterInspectionList
  for (const sec of masterInspectionList) {
    const picked = selections[sec.title];
    if (!picked || picked.length === 0) continue;

    const items: InspectionItem[] = sec.items
      .filter(i => picked.includes(i.item))
      .map(i => ({ item: i.item }));

    if (items.length) sections.push({ title: sec.title, items });
  }

  // 3) Optional service items (as a “Services” section)
  if (extraServiceItems.length) {
    sections.push({
      title: "Services",
      items: extraServiceItems.map(name => ({ item: name })),
    });
  }

  return sections;
}