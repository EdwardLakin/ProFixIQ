// features/work-orders/app/quote-review/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad, { openSignaturePad } from "@shared/signaturePad/controller";
import { formatCurrency } from "@/features/shared/lib/formatCurrency";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];

const SIGNATURE_BUCKET = "signatures";

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function QuoteReviewPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const woId = useSearchParams().get("woId");

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!woId) return;
    (async () => {
      setLoading(true);
      const { data: woRow } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", woId)
        .maybeSingle();
      setWo(woRow ?? null);

      if (woRow?.shop_id) {
        const { data: shopRow } = await supabase
          .from("shops")
          .select("*")
          .eq("id", woRow.shop_id)
          .maybeSingle();
        setShop(shopRow ?? null);
      }

      const { data: lineRows } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", woId)
        .order("created_at", { ascending: true });
      setLines(lineRows ?? []);
      setLoading(false);
    })();
  }, [woId, supabase]);

  const laborRate = 120;
  const totalLaborHours = lines.reduce(
    (sum, l) => sum + (typeof l.labor_time === "number" ? l.labor_time : 0),
    0
  );
  const laborTotal = totalLaborHours * laborRate;
  const partsTotal = 0;
  const grandTotal = laborTotal + partsTotal;

  const fmt = (n: number) => {
    try {
      return formatCurrency(n);
    } catch {
      return `$${n.toFixed(2)}`;
    }
  };

  async function handleSignatureSave(base64: string) {
    if (!woId) return;
    try {
      const blob = dataUrlToBlob(base64);
      const filename = `wo/${wo?.shop_id ?? "unknown"}/${woId}/${Date.now()}.png`;

      const { error: upErr } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .upload(filename, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("work_orders")
        .update({
          // @ts-ignore optional schema columns
          customer_approval_signature_path: filename,
          // @ts-ignore
          customer_approval_at: new Date().toISOString() as any,
          status: "queued" as any,
        })
        .eq("id", woId);
      if (updErr) throw updErr;

      alert("Work order approved and signed!");
      router.push("/work-orders/create?from=review&new=1");
    } catch (err: any) {
      alert(err?.message || "Failed to save signature");
    }
  }

  if (!woId) return <div className="p-6 text-red-500">Missing woId in URL.</div>;

  return (
    <div className="p-6 text-white">
      <div className="mb-4">
        <a
          href={`/work-orders/${woId}`}
          className="text-sm text-orange-400 hover:underline"
        >
          ← Back to Work Order
        </a>
      </div>

      <h1 className="text-2xl font-semibold">Quote Review</h1>

      {loading ? (
        <div className="mt-6">Loading…</div>
      ) : !wo ? (
        <div className="mt-6 text-red-500">Work order not found.</div>
      ) : (
        <>
          <div className="mt-2 text-sm text-neutral-300">
            <div>Work Order ID: {wo.id}</div>
            <div>Status: {(wo.status ?? "").replaceAll("_", " ") || "—"}</div>
            {shop?.name && <div>Shop: {shop.name}</div>}
          </div>

          <div className="mt-6 rounded border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 px-4 py-2 font-semibold">
              Line Items
            </div>
            <div className="divide-y divide-neutral-800">
              {lines.length === 0 ? (
                <div className="px-4 py-3 text-neutral-400">No items yet.</div>
              ) : (
                lines.map((l) => (
                  <div key={l.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {l.description || l.complaint || "Untitled job"}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {String(l.job_type ?? "job").replaceAll("_", " ")} •{" "}
                          {typeof l.labor_time === "number" ? `${l.labor_time}h` : "—"} •{" "}
                          {(l.status ?? "awaiting").replaceAll("_", " ")}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        {typeof l.labor_time === "number"
                          ? fmt(l.labor_time * laborRate)
                          : "—"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  Labor ({totalLaborHours.toFixed(1)}h @ {fmt(laborRate)}/hr)
                </span>
                <span className="font-medium">{fmt(laborTotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Parts</span>
                <span className="font-medium">{fmt(partsTotal)}</span>
              </div>
              <div className="mt-2 border-t border-neutral-800 pt-2 flex items-center justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-orange-400">{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                const base64 = await openSignaturePad({ shopName: shop?.name || "" });
                if (!base64) return;
                await handleSignatureSave(base64);
              }}
              className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
            >
              Approve & Sign
            </button>

            <a
              href={`/work-orders/${woId}`}
              className="rounded border border-neutral-700 px-4 py-2 hover:border-orange-500"
            >
              Back to Work Order
            </a>
          </div>
        </>
      )}

      <SignaturePad />
    </div>
  );
}