import type { Database } from "@shared/types/types/supabase";

type PartRow = Database["public"]["Tables"]["parts"]["Row"];

export type PartDisplaySummary = {
  id: string;
  name: string;
  sku: string | null;
  partNumber: string | null;
  category: string | null;
  price: number | null;
  internalRecordLabel: string;
  labeledIdentifiers: Array<{ label: "SKU" | "Part #"; value: string }>;
};

function clean(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

export function toPartDisplaySummary(part: Pick<PartRow, "id" | "name" | "sku" | "part_number" | "category" | "price">): PartDisplaySummary {
  const sku = clean(part.sku);
  const partNumber = clean(part.part_number);

  const labeledIdentifiers: PartDisplaySummary["labeledIdentifiers"] = [];
  if (sku) labeledIdentifiers.push({ label: "SKU", value: sku });
  if (partNumber) labeledIdentifiers.push({ label: "Part #", value: partNumber });

  return {
    id: String(part.id),
    name: clean(part.name) ?? "Unnamed part",
    sku,
    partNumber,
    category: clean(part.category),
    price: typeof part.price === "number" ? part.price : null,
    internalRecordLabel: `Record ${String(part.id).slice(0, 8)}`,
    labeledIdentifiers,
  };
}

export function partOptionLabel(summary: PartDisplaySummary): string {
  if (summary.sku) return `${summary.sku} — ${summary.name}`;
  if (summary.partNumber) return `${summary.partNumber} — ${summary.name}`;
  return summary.name;
}

export function partSearchText(summary: PartDisplaySummary): string {
  return [summary.name, summary.sku ?? "", summary.partNumber ?? "", summary.category ?? ""]
    .join(" ")
    .toLowerCase();
}
