"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad from "@shared/components/SignaturePad";
import { formatCurrency } from "@/features/shared/lib/formatCurrency";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

export default function QuoteReviewPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();
  const woId = useSearchParams().get("woId") ?? null;

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [sigOpen, setSigOpen] = useState(false);
  const [savingSig, setSavingSig] = useState(false);

  useEffect(() => {
    (async () => {
      if (!woId) return;
      setLoading(true);
      const { data: woRow } = await supabase.from("work_orders").select("*").eq("id", woId).maybeSingle();
      setWo(woRow ?? null);
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
  const totalLaborHours = (lines ?? [])
    .map((l) => (typeof l.labor_time === "number" ? l.labor_time : 0))
    .reduce((a, b) => a + b, 0);
  const laborTotal = totalLaborHours * laborRate;
  const partsTotal = 0;
  const grandTotal = laborTotal + partsTotal;

  function fmt(n: number) {
    try {
      return formatCurrency(n);
    } catch {
      return `$${n.toFixed(2)}`;
    }
  }

  // Safe dataURL -> Blob (Safari/iOS friendly)
  function dataURLtoBlob(dataUrl: string): Blob {
    const [meta, b64] = dataUrl.split(",");
    const mimeMatch = /^data:(.*?);base64$/.exec(meta || "");
    const mime = mimeMatch?.[1] || "image/png";
    const binary = atob(b64 || "");
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function handleSignatureSave(base64: string) {
    if (!woId || savingSig) return;
    setSavingSig(true);
    try {
      // 1) Upload to storage
      const file = dataURLtoBlob(base64);
      const filename = `wo-${woId}-${Date.now()}.png`;
      const up = await supabase.storage
        .from("signatures")
        .upload(filename, file, { contentType: "image/png", upsert: true });
      if (up.error) throw up.error;

      const { data: pub } = await supabase.storage.from("signatures").getPublicUrl(filename);
      const url = pub?.publicUrl ?? null;

      // 2) Update work order (best-effort)
      const upd = await supabase
        .from("work_orders")
        .update({
          customer_approval_signature_url: url as any,
          customer_approval_at: new Date().toISOString() as any,
          status: "queued" as any, // advance after approval per your flow
        })
        .eq("id", woId);
      if (upd.error) {
        console.warn("Work order update failed (columns may not exist):", upd.error.message);
      }

      setSigOpen(false);
      // Optional: return to WO or queue
      router.push(`/work-orders/${woId}`);
      alert("Signature captured. Thank you!");
    } catch (e: any) {
      alert(e?.message || "Failed to save signature");
    } finally {
      setSavingSig(false);
    }
  }

  if (!woId) {
    return <div className="p-6 text-red-500">Missing woId in URL.</div>;
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-4">
        <a href={`/work-orders/${woId}`} className="text-sm text-orange-400 hover:underline">
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
          </div>

          <div className="mt-6 rounded border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 px-4 py-2 font-semibold">Line Items</div>
            <div className="divide-y divide-neutral-800">
              {lines.length === 0 ? (
                <div className="px-4 py-3 text-neutral-400">No items yet.</div>
              ) : (
                lines.map((l) => (
                  <div key={l.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.description || l.complaint || "Untitled job"}</div>
                        <div className="text-xs text-neutral-400">
                          {String(l.job_type ?? "job").replaceAll("_", " ")} •{" "}
                          {typeof l.labor_time === "number" ? `${l.labor_time}h` : "—"} •{" "}
                          {(l.status ?? "awaiting").replaceAll("_", " ")}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        {typeof l.labor_time === "number" ? fmt(l.labor_time * laborRate) : "—"}
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
              onClick={() => setSigOpen(true)}
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

      {sigOpen && (
        <SignaturePad
          saving={savingSig}
          onSave={handleSignatureSave}
          onCancel={() => setSigOpen(false)}
        />
      )}
    </div>
  );
}