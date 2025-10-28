"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Request = DB["public"]["Tables"]["part_requests"]["Row"];
type Item = DB["public"]["Tables"]["part_request_items"]["Row"];
type Status = Request["status"];

export default function PartsRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [req, setReq] = useState<Request | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: r } = await supabase.from("part_requests").select("*").eq("id", id).maybeSingle();
    const { data: its } = await supabase.from("part_request_items").select("*").eq("request_id", id);
    setReq(r ?? null);
    setItems(its ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function setStatus(s: Status) {
    await supabase.rpc("set_part_request_status", { p_request: id, p_status: s });
    await load();
  }

  async function saveLine(it: Item) {
    // RPC expects a number; coerce null/undefined to 0 for typing safety
    const price: number =
      typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price) ? it.quoted_price : 0;

    await supabase.rpc("update_part_quote", {
      p_request: id,
      p_item: it.id,
      p_vendor: it.vendor ?? "",
      p_price: price,
    });
    await load();
  }

  return (
    <div className="p-6 text-white space-y-4">
      <button
        className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
        onClick={() => router.back()}
      >
        ← Back
      </button>

      {loading || !req ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-400">
          Loading…
        </div>
      ) : (
        <>
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xl font-semibold">Request #{req.id.slice(0, 8)}</div>
                <div className="text-sm text-neutral-400">
                  WO: {req.work_order_id ?? "—"} ·{" "}
                  {req.created_at ? new Date(req.created_at).toLocaleString() : "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-300 capitalize">Status: {req.status}</span>
                {req.status !== "approved" && (
                  <button
                    className="rounded border border-blue-600 text-blue-300 px-3 py-1.5 text-sm hover:bg-blue-900/20"
                    onClick={() => void setStatus("approved")}
                  >
                    Mark Approved
                  </button>
                )}
                {req.status !== "quoted" && (
                  <button
                    className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10"
                    onClick={() => void setStatus("quoted")}
                  >
                    Mark Quoted
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2">Vendor</th>
                  <th className="p-2 text-right">Quoted (unit)</th>
                  <th className="p-2 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-neutral-800">
                    <td className="p-2">{it.description}</td>
                    <td className="p-2 text-right">{Number(it.qty)}</td>
                    <td className="p-2">
                      <input
                        className="w-full rounded border border-neutral-700 bg-neutral-900 p-1"
                        value={it.vendor ?? ""}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x) => (x.id === it.id ? { ...x, vendor: e.target.value } : x)),
                          )
                        }
                      />
                    </td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        step={0.01}
                        className="w-28 rounded border border-neutral-700 bg-neutral-900 p-1 text-right"
                        value={
                          typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
                            ? it.quoted_price
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v = raw === "" ? null : Number(raw);
                          setItems((prev) =>
                            prev.map((x) => (x.id === it.id ? { ...x, quoted_price: v } : x)),
                          );
                        }}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <button
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        onClick={() => void saveLine(it)}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* FUTURE: buttons to push approved items to the WO and create stock moves */}
        </>
      )}
    </div>
  );
}