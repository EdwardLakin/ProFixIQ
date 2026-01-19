//features/work-orders/components/PartsUsedList.tsx

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

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickQty(a: AllocationRow): number | null {
  // common variants: qty, quantity
  return (
    num((a as any).qty) ??
    num((a as any).quantity) ??
    null
  );
}

function pickUnitPrice(a: AllocationRow): number | null {
  // Prefer SELL/unit if present; fall back to cost/unit
  return (
    num((a as any).sell_price) ??
    num((a as any).unit_price) ??
    num((a as any).price) ??
    num((a as any).quoted_price) ??
    num((a as any).unit_cost) ??
    null
  );
}

function pickLabel(a: AllocationRow): string {
  const fromJoin = a.parts?.name ?? null;

  const fallback =
    (a as any).description ??
    (a as any).part_name ??
    (a as any).name ??
    null;

  return String(fromJoin ?? fallback ?? "Part");
}

export function PartsUsedList({ allocations }: PartsUsedListProps): JSX.Element {
  if (!allocations.length) {
    return <div className="text-[11px] text-neutral-500">No parts used yet.</div>;
  }

  return (
    <ul className="mt-1 divide-y divide-neutral-800 rounded border border-neutral-800 text-sm">
      {allocations.map((a) => {
        const label = pickLabel(a);

        const locShort = (a as any).location_id
          ? String((a as any).location_id).slice(0, 6)
          : "-";

        const qty = pickQty(a);
        const unit = pickUnitPrice(a);

        const line =
          qty != null && unit != null ? qty * unit : null;

        return (
          <li
            key={String((a as any).id)}
            className="flex items-center justify-between bg-neutral-900/70 p-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-white">{label}</div>

              <div className="text-[11px] text-neutral-500">
                loc {locShort}
                {unit != null && (
                  <span className="ml-2">@{unit.toFixed(2)}</span>
                )}
              </div>
            </div>

            <div className="pl-3 text-right text-sm font-semibold text-neutral-100">
              {qty != null ? <span>× {qty}</span> : null}
              {line != null && (
                <div className="text-[11px] text-neutral-300">
                  ${line.toFixed(2)}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}