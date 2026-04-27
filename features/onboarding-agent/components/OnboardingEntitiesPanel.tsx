const ENTITY_ROWS: Array<{ key: string; label: string }> = [
  { key: "customer", label: "Customers" },
  { key: "vehicle", label: "Vehicles" },
  { key: "historical_work_order", label: "Historical work orders" },
  { key: "historical_invoice", label: "Historical invoices" },
  { key: "part", label: "Parts" },
  { key: "vendor", label: "Vendors" },
  { key: "staff_candidate", label: "Staff candidates" },
  { key: "menu_suggestion", label: "Menu suggestions" },
  { key: "inspection_suggestion", label: "Inspection suggestions" },
  { key: "unknown", label: "Unknown" },
];

const LINK_ROWS: Array<{ key: string; label: string }> = [
  { key: "customer_vehicle", label: "Customer ↔ Vehicle" },
  { key: "customer_work_order", label: "Customer ↔ Work order" },
  { key: "vehicle_work_order", label: "Vehicle ↔ Work order" },
  { key: "work_order_invoice", label: "Work order ↔ Invoice" },
  { key: "vendor_part", label: "Vendor ↔ Part" },
  { key: "service_menu_suggestion", label: "Service ↔ Menu suggestion" },
];

export function OnboardingEntitiesPanel({ entityCounts, linkCounts }: { entityCounts: Record<string, number>; linkCounts: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Staged entities & links</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Entities discovered</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {ENTITY_ROWS.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-2">
                <span>{item.label}</span>
                <span className="font-semibold text-white">{entityCounts[item.key] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Links found</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {LINK_ROWS.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-2">
                <span>{item.label}</span>
                <span className="font-semibold text-white">{linkCounts[item.key] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
