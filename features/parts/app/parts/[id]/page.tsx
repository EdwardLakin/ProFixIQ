import { getPart } from "@/features/parts/lib/parts.queries";
import { AdjustStockForm } from "@/features/parts/components/AdjustStockForm";

export default async function PartDetail({ params }: { params: { id: string } }) {
  const part = await getPart(params.id);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{part.name}</h1>
        <p className="text-neutral-600">{part.sku ?? ""}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4">
          <div className="font-semibold mb-2">Stock</div>
          {(part.v_part_stock ?? []).length ? (
            part.v_part_stock.map((s: any) => (
              <div key={s.location_id} className="flex justify-between py-1">
                <span>Loc {String(s.location_id).slice(0, 6)}…</span>
                <span>
                  {s.qty_available} avail (on hand {s.qty_on_hand})
                </span>
              </div>
            ))
          ) : (
            <div className="text-neutral-500">No stock yet</div>
          )}
        </div>

        <div className="border rounded-xl p-4">
          <div className="font-semibold mb-2">Quick Adjust</div>
          <AdjustStockForm partId={part.id} />
        </div>
      </div>
    </div>
  );
}
