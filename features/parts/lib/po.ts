/** Stubs for PO logic; wire to Supabase tables and email/pdf later. */
export type PoDraft = {
  supplier_id: string | null;
  notes?: string | null;
  lines: Array<{ part_id?: string|null; sku?: string|null; description?: string|null; qty: number; unit_cost?: number|null; location_id?: string|null }>;
};

export async function suggestReorder(): Promise<PoDraft[]> {
  throw new Error(
    "PO reorder suggestions are currently unavailable in production.",
  );
}

export async function createPoDraft(_draft: PoDraft): Promise<string> {
  throw new Error(
    "PO draft creation from this flow is currently unavailable in production.",
  );
}
