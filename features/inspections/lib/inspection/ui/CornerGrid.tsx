"use client";

import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
};

export default function CornerGrid({ sectionIndex, items }: Props) {
  const { updateItem } = useInspectionForm();

  const find = (label: string) =>
    items.findIndex((i) => (i.item ?? (i as any).name) === label);

  const Field = ({ label, placeholder }: { label: string; placeholder?: string }) => {
    const idx = find(label);
    const it = items[idx];
    return (
      <div className="space-y-1">
        <div className="text-xs text-zinc-400">{label}</div>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <input
            className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
            value={String((it?.value as any) ?? "")}
            onChange={(e) => updateItem(sectionIndex, idx, { value: e.target.value })}
            placeholder={placeholder ?? "—"}
          />
          <input
            className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
            value={it?.unit ?? ""}
            onChange={(e) => updateItem(sectionIndex, idx, { unit: e.target.value })}
            placeholder="unit"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* LEFT FRONT */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Left Front</div>
        <div className="grid gap-3">
          <Field label="LF Tire Tread" placeholder="mm" />
          <Field label="LF Brake Pad Thickness" placeholder="mm" />
          <Field label="LF Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* RIGHT FRONT */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Right Front</div>
        <div className="grid gap-3">
          <Field label="RF Tire Tread" placeholder="mm" />
          <Field label="RF Brake Pad Thickness" placeholder="mm" />
          <Field label="RF Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* LEFT REAR */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Left Rear</div>
        <div className="grid gap-3">
          <Field label="LR Tire Tread (Outer)" placeholder="mm" />
          <Field label="LR Tire Tread (Inner)" placeholder="mm" />
          <Field label="LR Brake Pad Thickness" placeholder="mm" />
          <Field label="LR Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* RIGHT REAR */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Right Rear</div>
        <div className="grid gap-3">
          <Field label="RR Tire Tread (Outer)" placeholder="mm" />
          <Field label="RR Tire Tread (Inner)" placeholder="mm" />
          <Field label="RR Brake Pad Thickness" placeholder="mm" />
          <Field label="RR Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* Wheel torque across bottom */}
      <div className="md:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">After Road Test</div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Wheel Torque (after road test)" placeholder="ft·lb" />
        </div>
      </div>
    </div>
  );
}