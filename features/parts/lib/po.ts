/** Stubs for PO logic; wire to Supabase tables and email/pdf later. */
export type PoDraft = {
  supplier_id: string | null;
  notes?: string | null;
  lines: Array<{ part_id?: string|null; sku?: string|null; description?: string|null; qty: number; unit_cost?: number|null; location_id?: string|null }>;
};

export async function suggestReorder(): Promise<PoDraft[]> {
  // TODO: compute from low_stock + recent usage
  return [];
}

export async function createPoDraft(_draft: PoDraft): Promise<string> {
  // TODO: insert into purchase_orders + purchase_order_lines and return id
  return "TODO-PO-ID";
}
