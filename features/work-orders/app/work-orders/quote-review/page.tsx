"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad from "@shared/components/SignaturePad";
import { formatCurrency } from "@/features/shared/lib/formatCurrency";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"]; // now actually used

const SIGNATURE_BUCKET = "signatures";

/** Convert a dataURL to a Blob (no window.atob assumption differences). */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/png";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function QuoteReviewPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const woId = useSearchParams().get("woId") ?? null;

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [sigOpen, setSigOpen] = useState(false);

  useEffect(() => {
    (async () => {
      if (!woId) return;
      setLoading(true);

      // Work order
      const { data: woRow } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", woId)
        .maybeSingle();
      setWo(woRow ?? null);

      // Lines
      const { data: lineRows } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", woId)
        .order("created_at", { ascending: true });
      setLines(lineRows ?? []);

      // Fetch shop (for branding & key prefix) if we have a shop_id
      if (woRow?.shop_id) {
        const { data: s } = await supabase
          .from("shops")
          .select("*")
          .eq("id", woRow.shop_id)
          .maybeSingle();
        setShop((s as Shop) ?? null);
      } else {
        setShop(null);
      }

      setLoading(false);
    })();
  }, [woId, supabase]);

  // Pricing (simple placeholder)
  const laborRate = 120; // TODO: fetch from org settings
  const totalLaborHours = (lines ?? [])
    .map((l) => (typeof l.labor_time === "number" ? l.labor_time : 0))
    .reduce((a, b) => a + b, 0);
  const laborTotal = totalLaborHours * laborRate;
  const partsTotal = 0; // TODO: sum real parts
  const grandTotal = laborTotal + partsTotal;

  // Currency formatter fallback
  function fmt(n: number) {
    try {
      return formatCurrency(n);
    } catch {
      return `$${n.toFixed(2)}`;
    }
  }

  async function handleSignatureSave(base64: string) {
    if (!woId || !wo) return;

    try {
      // Build a shop-scoped storage key so private bucket policies can allow R/W by shop
      const shopId = wo.shop_id as string | null;
      // If shop_id is missing, still allow saving but under a neutral prefix
      const keyPrefix = shopId ?? "unscoped";
      const filename = `${keyPrefix}/wo-${woId}-${Date.now()}.png`;

      // Upload to private bucket
      const blob = dataUrlToBlob(base64);
      const { error: upErr } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .upload(filename, blob, {
          contentType: "image/png",
          upsert: true,
        });
      if (upErr) throw upErr;

      // For private buckets we usually store the storage path (not a public URL).
      // If you also want a short-lived link later, generate a signed URL on demand.
      const signaturePath = filename;

      // Update WO (use whatever columns you have—keep both to be permissive)
      const updatePayload: Partial<WorkOrder> = {
        // if you created these columns:
        // @ts-ignore - tolerate missing columns in typings
        customer_approval_signature_path: signaturePath,
        // @ts-ignore - tolerate missing columns in typings
        customer_approval_signature_url: null,
        // @ts-ignore - tolerate missing columns in typings
        customer_approval_at: new Date().toISOString() as any,
        status: "queued" as any,
      };

      const { error: updErr } = await supabase
        .from("work_orders")
        .update(updatePayload)
        .eq("id", woId);

      if (updErr) {
        console.warn(
          "Work order update failed (columns may not exist):",
          updErr.message
        );
      }

      setSigOpen(false);

      // Confirmation toast/alert
      if (typeof window !== "undefined") {
        if ((window as any).toast) {
          (window as any).toast.success("Work order approved and signed!");
        } else {
          alert("Work order approved and signed!");
        }
      }

      // Redirect to new create page
      router.push("/work-orders/create?from=review&new=1");
    } catch (e: any) {
      alert(e?.message || "Failed to save signature");
    }
  }

  if (!woId) {
    return <div className="p-6 text-red-500">Missing woId in URL.</div>;
  }

  const shopDisplayName =
    // prefer a name-like field if available; fall back gently
    (shop as any)?.name ??
    (shop as any)?.title ??
    (shop as any)?.shop_name ??
    undefined;

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
          {/* WO Info */}
          <div className="mt-2 text-sm text-neutral-300">
            <div>Work Order ID: {wo.id}</div>
            <div>Status: {(wo.status ?? "").replaceAll("_", " ") || "—"}</div>
          </div>

          {/* Lines */}
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
                          {typeof l.labor_time === "number"
                            ? `${l.labor_time}h`
                            : "—"}{" "}
                          • {(l.status ?? "awaiting").replaceAll("_", " ")}
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

            {/* Totals */}
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
                <span className="font-bold text-orange-400">
                  {fmt(grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
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

      {/* Signature Pad */}
      {sigOpen && (
        <SignaturePad
          shopName={shopDisplayName}
          onSave={handleSignatureSave}
          onCancel={() => setSigOpen(false)}
        />
      )}
    </div>
  );
}