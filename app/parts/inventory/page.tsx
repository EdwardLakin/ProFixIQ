"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";

type DB = Database;
type Part = DB["public"]["Tables"]["parts"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];

export default function InventoryPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  // modal state
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [initLoc, setInitLoc] = useState<string>("");
  const [initQty, setInitQty] = useState<number>(0);

  const load = async (sid: string) => {
    setLoading(true);
    const q = supabase
      .from("parts")
      .select("*")
      .eq("shop_id", sid)
      .order("name", { ascending: true });
    const { data } = await (search.trim()
      ? q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,category.ilike.%${search}%`)
      : q);
    setParts((data as Part[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      if (!uid) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .single();

      const sid = prof?.shop_id ?? "";
      setShopId(sid);
      if (!sid) return;

      const { data: l } = await supabase
        .from("stock_locations")
        .select("*")
        .eq("shop_id", sid)
        .order("code");

      setLocs((l as StockLoc[]) ?? []);
      const main = (l as StockLoc[])?.find((x) => (x.code ?? "").toUpperCase() === "MAIN");
      if (main) setInitLoc(main.id);

      await load(sid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (shopId) void load(shopId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const createPart = async () => {
    if (!shopId || !name.trim()) return;

    const id = uuidv4();
    const insert = {
      id,
      shop_id: shopId,
      name: name.trim(),
      sku: sku.trim() || null,
      category: category.trim() || null,
      price: typeof price === "number" ? price : null,
    } satisfies DB["public"]["Tables"]["parts"]["Insert"];

    const { error } = await supabase.from("parts").insert(insert);
    if (error) {
      alert(error.message);
      return;
    }

    // Optional initial receive
    if (initLoc && initQty > 0) {
      const { error: smErr } = await supabase.rpc("apply_stock_move", {
        p_part: id,
        p_loc: initLoc,
        p_qty: initQty,
        p_reason: "receive",
        p_ref_kind: "manual_receive",
        p_ref_id: undefined,
      });
      if (smErr) alert(`Part created, but stock failed: ${smErr.message}`);
    }

    // reset + refresh
    setOpen(false);
    setName(""); setSku(""); setCategory(""); setPrice("");
    setInitQty(0);
    await load(shopId);
  };

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex items-center gap-2">
          <input
            className="w-56 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            placeholder="Search name / SKU / category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="font-header rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10"
            onClick={() => setOpen(true)}
            disabled={!shopId}
          >
            Add Part
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          Loading…
        </div>
      ) : parts.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          No parts yet. Click “Add Part” to create your first item.
        </div>
      ) : (
        <div className="rounded border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="p-2">Name</th>
                <th className="p-2">SKU</th>
                <th className="p-2">Category</th>
                <th className="p-2">Price</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-t border-neutral-800">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">{p.sku ?? "—"}</td>
                  <td className="p-2">{p.category ?? "—"}</td>
                  <td className="p-2">{typeof p.price === "number" ? `$${p.price.toFixed(2)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Part modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded border border-orange-500 bg-neutral-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Part</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="mb-1 text-xs text-neutral-400">Name*</div>
                <input
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Part name"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-400">SKU</div>
                <input
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-400">Category</div>
                <input
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-400">Price</div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  value={price === "" ? "" : price}
                  onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-3">
              <div className="mb-2 text-sm font-semibold">Initial Stock (optional)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Location</div>
                  <select
                    className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                    value={initLoc}
                    onChange={(e) => setInitLoc(e.target.value)}
                  >
                    <option value="">— none —</option>
                    {locs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {(l.code ?? "LOC") + " — " + (l.name ?? "")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Qty</div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                    value={initQty}
                    onChange={(e) => setInitQty(Math.max(0, Number(e.target.value || 0)))}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
                onClick={createPart}
                disabled={!name.trim()}
              >
                Save Part
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}