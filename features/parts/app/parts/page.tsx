import { listParts } from "@/features/parts/lib/parts.queries";

async function getShopId(): Promise<string> {
  const mod = await import("@/features/shared/lib/getUserSession");
  const session = await mod.getUserSession?.();
  return session?.shopId ?? "";
}

export default async function PartsPage() {
  const shopId = await getShopId();
  const parts = shopId ? await listParts(shopId) : [];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Parts</h1>
      <a
        href="/parts/new"
        className="px-3 py-2 rounded-xl bg-neutral-900 text-white"
      >
        New Part
      </a>
      <div className="grid grid-cols-1 gap-2">
        {parts.map((p) => (
          <a
            key={p.id}
            href={`/parts/${p.id}`}
            className="border rounded-xl p-3 hover:bg-neutral-50"
          >
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-neutral-500">
              {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
