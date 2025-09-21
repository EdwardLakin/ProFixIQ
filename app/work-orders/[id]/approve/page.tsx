"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad from "@/features/shared/components/SignaturePad";
import LegalTerms from "@/features/shared/components/LegalTerms";
import { uploadSignatureImage } from "@/features/shared/lib/utils/uploadSignature";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

export default function ApproveWorkOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // customer choices
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [openSign, setOpenSign] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedSigUrl, setSavedSigUrl] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

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
        setApproved(new Set((lineRows ?? []).map((l) => l.id))); // preselect all
      } catch (e) {
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

  const totals = useMemo(() => {
    const hrs = lines
      .filter((l) => approved.has(l.id))
      .reduce((a, b) => a + (typeof b.labor_time === "number" ? b.labor_time : 0), 0);
    return { hours: hrs.toFixed(1) };
  }, [lines, approved]);

  async function handleSubmit(signatureDataUrl?: string) {
    if (!id) return;

    setSubmitting(true);
    try {
      // upload signature (if captured)
      let signatureUrl: string | null = savedSigUrl;
      if (signatureDataUrl) {
        signatureUrl = await uploadSignatureImage(signatureDataUrl, id);
        setSavedSigUrl(signatureUrl);
      }

      const approvedLineIds = Array.from(approved);
      const declinedLineIds = lines.map((l) => l.id).filter((x) => !approved.has(x));

      const res = await fetch("/work-orders/approval-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: id,
          approvedLineIds,
          declinedLineIds,
          declineUnchecked: true,
          approverId: null,
          signatureUrl,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Failed to submit approval");

      router.replace(`/work-orders/confirm?woId=${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-white">
        <div className="animate-pulse h-8 w-48 bg-neutral-800 rounded mb-4" />
        <div className="animate-pulse h-24 bg-neutral-800 rounded" />
      </div>
    );
  }

  if (!wo) {
    return <div className="mx-auto max-w-2xl p-6 text-red-400">Work order not found.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 text-white">
      <h1 className="text-2xl font-semibold">Approve Work Order</h1>
      <p className="text-neutral-300 mt-1">{wo.custom_id ? `#${wo.custom_id}` : `#${wo.id.slice(0, 8)}`}</p>

      {err && <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3">{err}</div>}

      {/* Lines */}
      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900">
        <div className="p-3 border-b border-neutral-800 font-semibold">Items</div>
        <div className="divide-y divide-neutral-800">
          {lines.map((l) => (
            <label key={l.id} className="flex items-start gap-3 p-3 hover:bg-neutral-900/60 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={approved.has(l.id)}
                onChange={() => toggle(l.id)}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{l.description || l.complaint || "Untitled item"}</div>
                <div className="text-xs text-neutral-400">
                  {(l.job_type ?? "job").replaceAll("_", " ")} •{" "}
                  {typeof l.labor_time === "number" ? `${l.labor_time.toFixed(1)}h` : "—"}
                </div>
                {(l.cause || l.correction) && (
                  <div className="text-xs text-neutral-500 mt-1">
                    {l.cause ? `Cause: ${l.cause}  ` : ""}
                    {l.correction ? `| Corr: ${l.correction}` : ""}
                  </div>
                )}
              </div>
            </label>
          ))}
          {lines.length === 0 && <div className="p-3 text-neutral-400 text-sm">No items to approve.</div>}
        </div>
        <div className="p-3 border-t border-neutral-800 text-sm text-neutral-300">
          Total labor (approved): <span className="font-semibold text-white">{totals.hours}h</span>
        </div>
      </div>

      {/* Terms */}
      <LegalTerms onAgreeChange={setAgreed} defaultOpen />

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          onClick={() => setOpenSign(true)}
          disabled={submitting || !agreed}
          title={!agreed ? "Please agree to the Terms & Conditions" : "Sign & Submit"}
        >
          {submitting ? "Submitting…" : "Sign & Submit"}
        </button>

        <button
          className="rounded border border-neutral-700 px-4 py-2 hover:border-orange-500 disabled:opacity-60"
          onClick={() => handleSubmit(undefined)} // submit w/o signature
          disabled={submitting || !agreed}
        >
          Submit without Signature
        </button>
      </div>

      {/* Signature modal */}
      {openSign && (
        <SignaturePad
          onSave={async (b64: string) => {
            setOpenSign(false);
            await handleSubmit(b64);
          }}
          onCancel={() => setOpenSign(false)}
        />
      )}
    </div>
  );
}