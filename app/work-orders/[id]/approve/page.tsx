"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad, { openSignaturePad } from "@/features/shared/signaturePad/controller";
import LegalTerms from "@/features/shared/components/LegalTerms";
import { uploadSignatureImage } from "@/features/shared/lib/utils/uploadSignature";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];

export default function ApproveWorkOrderPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [savedSigUrl, setSavedSigUrl] = useState<string | null>(null);
  const [agreed, setAgreed] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);
      setErr(null);
      try {
        const [{ data: woRow, error: woErr }, { data: lineRows, error: liErr }] = await Promise.all([
          supabase.from("work_orders").select("*").eq("id", id).maybeSingle(),
          supabase
            .from("work_order_lines")
            .select("*")
            .eq("work_order_id", id)
            .neq("status", "completed")
            .order("created_at", { ascending: true }),
        ]);

        if (woErr) throw woErr;
        if (liErr) throw liErr;

        setWo(woRow ?? null);
        setLines(lineRows ?? []);
        setApproved(new Set((lineRows ?? []).map((l) => l.id)));

        if (woRow?.shop_id) {
          const { data: shopRow, error: sErr } = await supabase
            .from("shops")
            .select("*")
            .eq("id", woRow.shop_id)
            .maybeSingle();
          if (sErr) throw sErr;
          setShop(shopRow ?? null);
        } else {
          setShop(null);
        }
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load work order.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, supabase]);

  const toggle = (lineId: string) =>
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });

  // ---- Pricing helpers (mirrors Quote Review) ------------------------------
  const hourlyRate =
    (wo as any)?.hourly_rate ??
    (shop as any)?.hourly_rate ??
    120; // sensible default if not stored

  const currency = (shop as any)?.currency ?? "USD";
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency });

  const approvedLines = lines.filter((l) => approved.has(l.id));
  const hours = approvedLines.reduce<number>(
    (sum, l) => sum + (typeof l.labor_time === "number" ? l.labor_time : 0),
    0
  );
  const laborTotal = hours * Number(hourlyRate || 0);

  // if your line rows do not have any parts total, this will just be 0
  const partsTotal = approvedLines.reduce<number>(
    (sum, l) => sum + (typeof (l as any).parts_total === "number" ? (l as any).parts_total : 0),
    0
  );
  const grandTotal = laborTotal + partsTotal;

  // keep existing total hours for the small footer in the Items box
  const totals = { hours: hours.toFixed(1) };

  // --------------------------------------------------------------------------

  async function handleSubmit(signatureDataUrl?: string) {
    if (!id) return;
    setSubmitting(true);
    try {
      let signatureUrl: string | null = savedSigUrl;
      if (signatureDataUrl) {
        const uploaded = await uploadSignatureImage(signatureDataUrl, id);
        signatureUrl = uploaded;
        setSavedSigUrl(uploaded);
      }

      const approvedLineIds = Array.from(approved);
      const declinedLineIds = lines.map((l) => l.id).filter((x) => !approved.has(x));

      const res = await fetch("/work-orders/approval-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: id,
          shopId: wo?.shop_id ?? null,      // pass tenant keys like Quote Review
          customerId: wo?.customer_id ?? null,
          approvedLineIds,
          declinedLineIds,
          declineUnchecked: true,
          approverId: null,
          signatureUrl,
        }),
      });

      const j: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof j === "object" && j && "error" in (j as Record<string, unknown>)
            ? String((j as { error?: unknown }).error ?? "Failed to submit approval")
            : "Failed to submit approval";
        throw new Error(msg);
      }

      router.replace(`/work-orders/confirm?woId=${id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-white">
        <div className="mb-4 h-8 w-48 animate-pulse rounded bg-neutral-800" />
        <div className="h-24 animate-pulse rounded bg-neutral-800" />
      </div>
    );
  }

  if (!wo) {
    return <div className="mx-auto max-w-2xl p-6 text-red-400">Work order not found.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 text-white sm:p-6">
      <h1 className="text-2xl font-semibold">
        {shop?.name ? `${shop.name} — Customer Approval` : "Approve Work Order"}
      </h1>
      <p className="mt-1 text-neutral-300">
        {wo.custom_id ? `#${wo.custom_id}` : `#${wo.id.slice(0, 8)}`}
      </p>

      {err && <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3">{err}</div>}

      {/* Items */}
      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 p-3 font-semibold">Items</div>
        <div className="divide-y divide-neutral-800">
          {lines.map((l) => (
            <label
              key={l.id}
              className="flex cursor-pointer items-start gap-3 p-3 hover:bg-neutral-900/60"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={approved.has(l.id)}
                onChange={() => toggle(l.id)}
              />
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {l.description || l.complaint || "Untitled item"}
                </div>
                <div className="text-xs text-neutral-400">
                  {(l.job_type ?? "job").replaceAll("_", " ")} •{" "}
                  {typeof l.labor_time === "number" ? `${l.labor_time.toFixed(1)}h` : "—"}
                </div>
                {(l.cause || l.correction) && (
                  <div className="mt-1 text-xs text-neutral-500">
                    {l.cause ? `Cause: ${l.cause}  ` : ""}
                    {l.correction ? `| Corr: ${l.correction}` : ""}
                  </div>
                )}
              </div>
            </label>
          ))}
          {lines.length === 0 && (
            <div className="p-3 text-sm text-neutral-400">No items to approve.</div>
          )}
        </div>
        <div className="border-t border-neutral-800 p-3 text-sm text-neutral-300">
          Total labor (approved):{" "}
          <span className="font-semibold text-white">{totals.hours}h</span>
        </div>
      </div>

      {/* Totals (like Quote Review) */}
      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 p-3 font-semibold">Totals</div>
        <div className="p-3 text-sm">
          <div className="flex items-center justify-between py-1">
            <div>Labor ({hours.toFixed(1)}h @ {fmt.format(Number(hourlyRate || 0))}/hr)</div>
            <div className="font-medium">{fmt.format(laborTotal)}</div>
          </div>
          <div className="flex items-center justify-between py-1">
            <div>Parts</div>
            <div className="font-medium">{fmt.format(partsTotal)}</div>
          </div>
          <div className="mt-2 border-t border-neutral-800 pt-2 flex items-center justify-between">
            <div className="font-semibold">Total</div>
            <div className="font-semibold">{fmt.format(grandTotal)}</div>
          </div>
        </div>
      </div>

      {/* Terms */}
      <LegalTerms onAgreeChange={setAgreed} defaultOpen />

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          onClick={async () => {
            const base64 = await openSignaturePad({ shopName: shop?.name || "" });
            if (base64) await handleSubmit(base64);
          }}
          disabled={submitting || !agreed}
          title={!agreed ? "Please agree to the Terms & Conditions" : "Sign & Submit"}
        >
          {submitting ? "Submitting…" : "Sign & Submit"}
        </button>

        <button
          className="rounded border border-neutral-700 px-4 py-2 hover:border-orange-500 disabled:opacity-60"
          onClick={() => void handleSubmit(undefined)}
          disabled={submitting || !agreed}
        >
          Submit without Signature
        </button>
      </div>

      {/* Mount the modal host once */}
      <SignaturePad />
    </div>
  );
}