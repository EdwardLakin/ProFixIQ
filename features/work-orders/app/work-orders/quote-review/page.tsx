"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad, { openSignaturePad } from "@/features/shared/signaturePad/controller";
import { formatCurrency } from "@/features/shared/lib/formatCurrency";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];

const SIGNATURE_BUCKET = "signatures";

/* ----------------------------- helpers ----------------------------- */

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const fmt = (n: number) => {
  try {
    return formatCurrency(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
};

/* ----------------------- approvals list (cards) ----------------------- */

function ApprovalsList() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<WorkOrderWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  type WorkOrderWithMeta = WorkOrder & {
    shops?: Pick<Shop, "name"> | null;
    labor_hours?: number | null;
  };

  const load = useCallback(async () => {
    setLoading(true);

    // Only show WOs waiting for approval now
    const { data: wo, error } = await supabase
      .from("work_orders")
      .select(`*, shops!inner(name)`)
      .eq("approval_state", "awaiting")
      .order("created_at", { ascending: false });

    if (error) {
      setRows([]);
      setLoading(false);
      return;
    }

    let withMeta: WorkOrderWithMeta[] = (wo ?? []) as unknown as WorkOrderWithMeta[];

    if (withMeta.length) {
      const woIds = withMeta.map((w) => w.id);
      const { data: lines } = await supabase
        .from("work_order_lines")
        .select("work_order_id, labor_time")
        .in("work_order_id", woIds);

      const hoursByWO = new Map<string, number>();
      (lines ?? []).forEach((l) => {
        const cur = hoursByWO.get(l.work_order_id) ?? 0;
        hoursByWO.set(
          l.work_order_id,
          cur + (typeof l.labor_time === "number" ? l.labor_time : 0)
        );
      });

      withMeta = withMeta.map((w) => ({
        ...w,
        labor_hours: hoursByWO.get(w.id) ?? 0,
      }));
    }

    setRows(withMeta);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();

    // Light auto-refresh so the list clears after approvals
    const onFocus = () => void load();
    document.addEventListener("visibilitychange", onFocus);
    const t = setInterval(onFocus, 20000);

    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(t);
    };
  }, [load]);

  if (loading) return <div className="mt-6 text-neutral-400">Loading…</div>;
  if (rows.length === 0)
    return (
      <div className="mt-6 text-neutral-400">
        No work orders waiting for approval.
      </div>
    );

  return (
    <div className="mt-4 rounded border border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 px-4 py-2 font-semibold">
        Awaiting Approval
      </div>

      <div className="divide-y divide-neutral-800">
        {rows.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">
                {w.custom_id ? `#${w.custom_id}` : `#${w.id.slice(0, 8)}`}
              </div>
              <div className="text-xs text-neutral-400">
                {w.shops?.name ? `${w.shops.name} • ` : ""}
                {(w.status ?? "").replaceAll("_", " ")}
                {typeof w.labor_hours === "number"
                  ? ` • ${w.labor_hours.toFixed(1)}h`
                  : ""}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={`/work-orders/${w.id}/approve`}
                className="rounded border border-orange-500 px-3 py-1 text-sm text-orange-400 hover:bg-orange-500/10"
                title="Open customer-facing approval workflow"
              >
                Review &amp; Sign
              </a>
              <a
                href={`/work-orders/${w.id}`}
                className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800"
                title="Open this work order"
              >
                Open WO
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------- single WO review + sign ---------------------- */

function SingleQuoteReview({ woId }: { woId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

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

  async function handleSignatureSave(base64: string) {
    if (!woId) return;
    try {
      // Store the raw image
      const blob = dataUrlToBlob(base64);
      const filename = `wo/${wo?.shop_id ?? "unknown"}/${woId}/${Date.now()}.png`;

      const { error: upErr } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .upload(filename, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;

      // Mark this WO as approved + queued (so it disappears from this page)
      const { error: updErr } = await supabase
        .from("work_orders")
        .update({
          // keep your stored path; and set approval_state + status
          // @ts-ignore: column may be pending in generated types
          customer_approval_signature_path: filename,
          // @ts-ignore
          customer_approval_at: new Date().toISOString() as unknown as string,
          // @ts-ignore
          approval_state: "approved",
          status: "queued",
        })
        .eq("id", woId);
      if (updErr) throw updErr;

      alert("Work order approved and signed!");
      router.push("/work-orders/create?from=review&new=1");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save signature";
      alert(msg);
    }
  }

  async function markAwaitingApproval() {
    if (!woId) return;
    try {
      const { error } = await supabase
        .from("work_orders")
        .update({
          status: "awaiting_approval",
          // @ts-ignore
          approval_state: "awaiting",
          // @ts-ignore
          customer_approval_signature_path: null,
          // @ts-ignore
          customer_approval_at: null,
        })
        .eq("id", woId);
      if (error) throw error;
      alert("Saved. This work order is now awaiting customer approval.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update status.";
      alert(msg);
    }
  }

  function copyApprovalLink() {
    if (!woId) return;
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const url = `${origin || ""}/work-orders/${woId}/approve`;
    navigator.clipboard
      .writeText(url)
      .then(() => alert("Approval link copied to clipboard."))
      .catch(() => alert(url));
  }

  if (loading) return <div className="mt-6 text-neutral-400">Loading…</div>;
  if (!wo) return <div className="mt-6 text-red-500">Work order not found.</div>;

  return (
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
                      ? fmt(l.labor_time * 120)
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
              Labor ({totalLaborHours.toFixed(1)}h @ {fmt(120)}/hr)
            </span>
            <span className="font-medium">{fmt(laborTotal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Parts</span>
            <span className="font-medium">{fmt(0)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-neutral-800 pt-2">
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
          Approve &amp; Sign
        </button>

        <button
          onClick={markAwaitingApproval}
          className="rounded border border-neutral-700 px-4 py-2 hover:border-orange-500"
          title="Save this work order as awaiting customer approval"
        >
          Save for Customer Approval
        </button>

        <button
          onClick={copyApprovalLink}
          className="rounded border border-neutral-700 px-4 py-2 hover:border-orange-500"
          title="Copy link to the customer-facing approval page"
        >
          Copy Approval Link
        </button>

        <a
          href={`/work-orders/${woId}`}
          className="rounded border border-neutral-700 px-4 py-2 hover:border-orange-500"
        >
          Back to Work Order
        </a>
      </div>
    </>
  );
}

/* ------------------------------ page ------------------------------ */

export default function QuoteReviewPage() {
  const woId = useSearchParams().get("woId");
  const router = useRouter();

  return (
    <div className="p-6 text-white">
      <div className="mb-4">
        <button onClick={() => router.back()} className="text-sm text-orange-400 hover:underline">
          ← Back
        </button>
      </div>

      <h1 className="text-2xl font-semibold">Quote Review</h1>

      {!woId ? (
        <>
          <p className="mt-1 text-neutral-300">Work orders waiting for customer approval</p>
          <ApprovalsList />
          <SignaturePad />
        </>
      ) : (
        <>
          <SingleQuoteReview woId={woId} />
          <SignaturePad />
        </>
      )}
    </div>
  );
}