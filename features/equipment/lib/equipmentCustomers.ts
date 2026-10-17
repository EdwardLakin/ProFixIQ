import type { EquipmentIdentityRow } from "./equipmentDirectoryQuery";

export type EquipmentCustomer = {
  id: string;
  name: string;
  assets: EquipmentIdentityRow[];
};

/** Project canonical, RLS-visible Equipment identities before search/count/page. */
export function equipmentCustomers(
  rows: EquipmentIdentityRow[],
): EquipmentCustomer[] {
  const customers = new Map<string, EquipmentCustomer>();
  for (const row of rows) {
    // A vehicle relationship alone does not prove the customer is visible.
    if (!row.customerId || !row.customerName) continue;
    const customer = customers.get(row.customerId) ?? {
      id: row.customerId,
      name: row.customerName,
      assets: [],
    };
    if (!customer.assets.some((asset) => asset.assetId === row.assetId))
      customer.assets.push(row);
    customers.set(customer.id, customer);
  }
  return [...customers.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
