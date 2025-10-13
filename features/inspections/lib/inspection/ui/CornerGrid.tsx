"use client";

import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  /** Provide the unit to show when item.unit is empty */
  unitHint?: (label: string) => string;
};

export default function CornerGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();

  const find = (label: string) =>
    items.findIndex((i) => (i.item ?? (i as any).name) === label);

  const UnitBadge = ({ label }: { label: string }) => {
    const idx = find(label);
    const unit = idx >= 0 ? (items[idx]?.unit ?? "") : "";
    const resolved = unit || (unitHint ? unitHint(label) : "");
    return (
      <div className="text-center text-xs text-zinc-400 select-none">
        {resolved}
      </div>
    );
  };

  const ValueField = ({
    label,
    placeholder,
  }: {
    label: string;
    placeholder?: string;
  }) => {
    const idx = find(label);
    // If the label is missing (schema drift), render a disabled box
    if (idx < 0) {
      return (
        <input
          className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white opacity-60"
          disabled
          placeholder={placeholder ?? "—"}
        />
      );
    }
    const it = items[idx];

    return (
      <input
        className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
        value={String((it?.value as any) ?? "")}
        onChange={(e) => updateItem(sectionIndex, idx, { value: e.target.value })}
        placeholder={placeholder ?? "—"}
      />
    );
  };

  const Row = ({
    leftLabel,
    rightLabel,
    unitFor,
    placeholder,
  }: {
    leftLabel: string;
    rightLabel: string;
    unitFor: string; // label to resolve unit from (usually the leftLabel)
    placeholder?: string;
  }) => {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <ValueField label={leftLabel} placeholder={placeholder} />
        <UnitBadge label={unitFor} />
        <ValueField label={rightLabel} placeholder={placeholder} />
      </div>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* LEFT FRONT */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Left Front</div>
        <div className="space-y-3">
          <Row
            leftLabel="LF Tire Tread"
            rightLabel="RF Tire Tread"
            unitFor="LF Tire Tread"
            placeholder="mm"
          />
          <Row
            leftLabel="LF Tire Pressure"
            rightLabel="RF Tire Pressure"
            unitFor="LF Tire Pressure"
            placeholder="psi"
          />
          <Row
            leftLabel="LF Brake Pad Thickness"
            rightLabel="RF Brake Pad Thickness"
            unitFor="LF Brake Pad Thickness"
            placeholder="mm"
          />
          <Row
            leftLabel="LF Rotor Condition / Thickness"
            rightLabel="RF Rotor Condition / Thickness"
            unitFor="LF Rotor Condition / Thickness"
            placeholder="mm"
          />
        </div>
      </div>

      {/* RIGHT/REAR GROUPS */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Left Rear / Right Rear</div>
        <div className="space-y-3">
          <Row
            leftLabel="LR Tire Tread (Outer)"
            rightLabel="RR Tire Tread (Outer)"
            unitFor="LR Tire Tread (Outer)"
            placeholder="mm"
          />
          <Row
            leftLabel="LR Tire Tread (Inner)"
            rightLabel="RR Tire Tread (Inner)"
            unitFor="LR Tire Tread (Inner)"
            placeholder="mm"
          />
          <Row
            leftLabel="LR Tire Pressure"
            rightLabel="RR Tire Pressure"
            unitFor="LR Tire Pressure"
            placeholder="psi"
          />
          <Row
            leftLabel="LR Brake Pad Thickness"
            rightLabel="RR Brake Pad Thickness"
            unitFor="LR Brake Pad Thickness"
            placeholder="mm"
          />
          <Row
            leftLabel="LR Rotor Condition / Thickness"
            rightLabel="RR Rotor Condition / Thickness"
            unitFor="LR Rotor Condition / Thickness"
            placeholder="mm"
          />
        </div>
      </div>

      {/* Wheel torque across bottom */}
      <div className="md:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">After Road Test</div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <ValueField label="Wheel Torque (after road test)" placeholder="ft·lb" />
            <UnitBadge label="Wheel Torque (after road test)" />
          </div>
        </div>
      </div>
    </div>
  );
}