export default function PartsDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Parts Dashboard</h1>
      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-400">SKUs</div>
          <div className="text-xl font-semibold">—</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-400">Low Stock</div>
          <div className="text-xl font-semibold">—</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-400">Inventory Value</div>
          <div className="text-xl font-semibold">—</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-400">Moves (7d)</div>
          <div className="text-xl font-semibold">—</div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <a className="rounded border border-orange-500 px-3 py-2 text-sm" href="/parts/po">Create PO</a>
          <a className="rounded border border-neutral-700 px-3 py-2 text-sm" href="/parts/inventory">Inventory</a>
          <a className="rounded border border-neutral-700 px-3 py-2 text-sm" href="/parts/vendors">Vendors</a>
        </div>
      </section>

      {/* Recent moves placeholder */}
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Recent Stock Moves</h2>
        <div className="text-sm text-neutral-400">Coming soon…</div>
      </section>
    </div>
  );
}
