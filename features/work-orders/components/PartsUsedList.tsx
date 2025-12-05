"use client";


import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };

export type PartsUsedListProps = {
  allocations: AllocationRow[];
};

export function PartsUsedList({
  allocations,
}: PartsUsedListProps): JSX.Element {
  if (!allocations.length) {
    return (
      <div className="text-[11px] text-neutral-500">
        No parts used yet.
      </div>
    );
  }

  return (
    <ul className="mt-1 divide-y divide-neutral-800 rounded border border-neutral-800 text-sm">
      {allocations.map((a) => {
        const partName = a.parts?.name ?? "Part";
        const locShort = a.location_id
          ? String(a.location_id).slice(0, 6)
          : "-";

        const unitCost =
          typeof a.unit_cost === "number" ? a.unit_cost : null;
        const qty = typeof a.qty === "number" ? a.qty : null;
        const lineCost =
          unitCost != null && qty != null ? unitCost * qty : null;

        return (
          <li
            key={a.id}
            className="flex items-center justify-between bg-neutral-900/70 p-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-white">
                {partName}
              </div>
              <div className="text-[11px] text-neutral-500">
                loc {locShort}
                {unitCost != null && (
                  <span className="ml-2">
                    @{unitCost.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            <div className="pl-3 text-right text-sm font-semibold text-neutral-100">
              {qty != null ? <span>× {qty}</span> : null}
              {lineCost != null && (
                <div className="text-[11px] text-neutral-300">
                  ${lineCost.toFixed(2)}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}