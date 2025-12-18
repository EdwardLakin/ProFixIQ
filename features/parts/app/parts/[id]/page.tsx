import Link from "next/link";
import { getPart } from "@/features/parts/lib/parts.queries";
import { AdjustStockForm } from "@/features/parts/components/AdjustStockForm";

const shell = "p-6 text-white";
const glass = "rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm shadow-[0_0_40px_rgba(0,0,0,0.65)]";
const muted = "text-neutral-400";
const btn =
  "inline-flex items-center justify-center rounded-full border border-white/12 bg-black/40 px-3 py-1.5 text-sm text-neutral-200 hover:border-orange-400/60 hover:text-white";

export default async function PartDetail({ params }: { params: { id: string } }) {
  const part = await getPart(params.id);

  return (
    <div className={shell}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Parts</div>
          <h1 className="font-header text-3xl text-orange-400">{part.name}</h1>
          <p className={`mt-1 text-sm ${muted}`}>{part.sku ?? ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={btn} href="/parts">Inventory</Link>
          <Link className={btn} href="/parts/new">New Part</Link>
          <Link className={btn} href="/parts/suppliers">Suppliers</Link>
          <Link className={btn} href="/parts/locations">Locations</Link>
          <Link className={btn} href="/dashboard/parts">Requests</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${glass} p-4`}>
          <div className="mb-2 text-sm font-semibold text-neutral-200">Stock</div>

          {(part.v_part_stock ?? []).length ? (
            <div className="grid gap-2">
              {(part.v_part_stock ?? []).map((s: unknown) => {
                const row = s as {
                  location_id: string;
                  qty_available: number;
                  qty_on_hand: number;
                };
                return (
                  <div
                    key={row.location_id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                  >
                    <span className="text-sm text-neutral-200">
                      Loc {String(row.location_id).slice(0, 6)}…
                    </span>
                    <span className="text-sm tabular-nums text-neutral-200">
                      {Number(row.qty_available)} avail{" "}
                      <span className="text-xs text-neutral-500">
                        (on hand {Number(row.qty_on_hand)})
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`rounded-xl border border-white/10 bg-black/25 p-3 text-sm ${muted}`}>
              No stock yet
            </div>
          )}
        </div>

        <div className={`${glass} p-4`}>
          <div className="mb-2 text-sm font-semibold text-neutral-200">Quick Adjust</div>
          <AdjustStockForm partId={part.id} />
          <p className={`mt-2 text-xs ${muted}`}>
            Tip: positive quantity = receive, negative = adjust.
          </p>
        </div>
      </div>
    </div>
  );
}
