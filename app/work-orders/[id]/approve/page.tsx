"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad, {
  openSignaturePad,
} from "@/features/shared/signaturePad/controller";
import LegalTerms from "@/features/shared/components/LegalTerms";
import { uploadSignatureImage } from "@/features/shared/lib/utils/uploadSignature";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];

/* ------------------------------ helpers ---------------------------------- */
const getStr = (obj: unknown, key: string): string | null => {
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v.trim() || null;
  }
  return null;
};

const getNum = (obj: unknown, key: string): number | null => {
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
};
/* ------------------------------------------------------------------------- */

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
        const [
          { data: woRow, error: woErr },
          { data: lineRows, error: liErr },
        ] = await Promise.all([
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

        setWo((woRow as WorkOrder | null) ?? null);
        setLines((lineRows as Line[] | null) ?? []);
        setApproved(new Set(((lineRows as Line[] | null) ?? []).map((l) => l.id)));

        if (woRow?.shop_id) {
          const { data: shopRow, error: sErr } = await supabase
            .from("shops")
            .select("*")
            .eq("id", woRow.shop_id)
            .maybeSingle();
          if (sErr) throw sErr;
          setShop((shopRow as Shop | null) ?? null);
        } else {
          setShop(null);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load work order.";
        setErr(msg);
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

  /* ---- Pricing helpers (mirrors Quote Review) --------------------------- */
  const hourlyRate: number =
    getNum(wo, "hourly_rate") ?? getNum(shop, "hourly_rate") ?? 120;

  const currencyCode = (getStr(shop, "currency") ?? "USD").toUpperCase();
  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
      }),
    [currencyCode],
  );

  const approvedLines = lines.filter((l) => approved.has(l.id));
  const hours = approvedLines.reduce<number>(
    (sum, l) =>
      sum + (typeof l.labor_time === "number" ? l.labor_time : 0),
    0,
  );
  const laborTotal = hours * hourlyRate;

  const partsTotal = approvedLines.reduce<number>(
    (sum, l) => sum + (getNum(l, "parts_total") ?? 0),
    0,
  );
  const grandTotal = laborTotal + partsTotal;

  const totals = { hours: hours.toFixed(1) };
  /* ---------------------------------------------------------------------- */

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

      const approvedLineIds: string[] = Array.from(approved);
      const declinedLineIds: string[] = lines
        .map((l) => l.id)
        .filter((x) => !approved.has(x));

      const res = await fetch("/work-orders/approval-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: id,
          shopId: wo?.shop_id ?? null,
          customerId: wo?.customer_id ?? null,
          approvedLineIds,
          declinedLineIds,
          declineUnchecked: true,
          approverId: null,
          signatureUrl,
        }),
      });

      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(j?.error ?? "Failed to submit approval");
      }

      router.replace(`/work-orders/confirm?woId=${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setSubmitting(false);
    }
  }

  /* -------------------------- Loading / not found ------------------------ */

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#020617,_#000)] px-4 py-8 text-white">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-neutral-800/60" />
          <div className="h-24 animate-pulse rounded-2xl bg-neutral-900/70" />
        </div>
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#020617,_#000)] px-4 py-8 text-red-400">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/50 bg-red-950/60 p-4 text-sm">
          Work order not found.
        </div>
      </div>
    );
  }

  /* ------------------------------- UI ------------------------------------ */

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0b1120,_#000)] px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header card */}
        <section className="metal-panel metal-panel--card rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-white shadow-[0_0_40px_rgba(0,0,0,0.85)] backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-lg font-blackops tracking-[0.18em] text-[var(--accent-copper-light)]">
                {shop?.name
                  ? `${shop.name} — Approval`
                  : "Customer Approval"}
              </h1>
              <p className="text-xs text-neutral-300">
                Review the work and sign to approve the selected items.
              </p>
              <p className="text-[0.7rem] font-mono text-neutral-400">
                WO{" "}
                <span className="text-[var(--accent-copper-soft)]">
                  {wo.custom_id ?? `#${wo.id.slice(0, 8)}`}
                </span>
              </p>
            </div>
            <div className="rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[0.7rem] text-neutral-200">
              <span className="text-neutral-400">Estimate Total</span>
              <div className="text-sm font-semibold text-[var(--accent-copper-light)]">
                {fmt.format(grandTotal)}
              </div>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-xl border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100">
              {err}
            </div>
          )}
        </section>

        {/* Items card */}
        <section className="glass-card rounded-2xl border border-white/10 bg-black/40 px-4 py-4 shadow-[0_0_30px_rgba(0,0,0,0.7)] backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Items to approve
              </h2>
              <p className="text-[0.7rem] text-neutral-400">
                Check the work you authorize. Unchecked items will be declined.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[0.7rem] text-neutral-300">
              Approved labor:{" "}
              <span className="font-semibold text-[var(--accent-copper-light)]">
                {totals.hours}h
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/5 bg-black/40">
            {lines.length === 0 ? (
              <div className="p-3 text-sm text-neutral-400">
                No items to approve.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {lines.map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-neutral-500 bg-black/80 text-[var(--accent-copper)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper)]"
                      checked={approved.has(l.id)}
                      onChange={() => toggle(l.id)}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">
                        {l.description || l.complaint || "Untitled item"}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
                        {(l.job_type ?? "job")
                          .toString()
                          .replaceAll("_", " ")}{" "}
                        •{" "}
                        {typeof l.labor_time === "number"
                          ? `${l.labor_time.toFixed(1)}h`
                          : "—"}
                      </div>
                      {(l.cause || l.correction) && (
                        <div className="mt-1 text-[0.7rem] text-neutral-400">
                          {l.cause && (
                            <>
                              <span className="font-semibold text-neutral-300">
                                Cause:
                              </span>{" "}
                              {l.cause}{" "}
                            </>
                          )}
                          {l.correction && (
                            <>
                              <span className="mx-1 text-neutral-600">|</span>
                              <span className="font-semibold text-neutral-300">
                                Correction:
                              </span>{" "}
                              {l.correction}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-[0.75rem] text-neutral-300">
            <span>
              You can uncheck any work you do{" "}
              <span className="font-semibold text-neutral-100">not</span> want
              performed.
            </span>
          </div>
        </section>

        {/* Totals card */}
        <section className="glass-card rounded-2xl border border-white/10 bg-gradient-to-b from-black/60 via-black/40 to-black/70 px-4 py-4 shadow-[0_0_30px_rgba(0,0,0,0.7)] backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Totals</h2>
            <span className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">
              Summary
            </span>
          </div>

          <div className="space-y-2 text-sm text-neutral-200">
            <div className="flex items-center justify-between">
              <span>
                Labor ({hours.toFixed(1)}h @ {fmt.format(hourlyRate)}/hr)
              </span>
              <span className="font-medium text-neutral-50">
                {fmt.format(laborTotal)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Parts</span>
              <span className="font-medium text-neutral-50">
                {fmt.format(partsTotal)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-sm font-semibold text-white">Total</span>
              <span className="text-base font-semibold text-[var(--accent-copper-light)]">
                {fmt.format(grandTotal)}
              </span>
            </div>
          </div>
        </section>

        {/* Terms */}
        <div className="glass-card rounded-2xl border border-white/10 bg-black/40 px-4 py-4 backdrop-blur-md">
          <LegalTerms onAgreeChange={setAgreed} defaultOpen />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-[var(--accent-copper)] px-5 py-2.5 text-sm font-semibold text-black shadow-[0_0_30px_rgba(0,0,0,0.9)] transition hover:bg-[var(--accent-copper-light)] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={async () => {
              const base64: string | null = await openSignaturePad({
                shopName: shop?.name || "",
              });
              if (base64) await handleSubmit(base64);
            }}
            disabled={submitting || !agreed}
            title={
              !agreed
                ? "Please agree to the Terms & Conditions"
                : "Sign & Submit"
            }
          >
            {submitting ? "Submitting…" : "Sign & Approve Work"}
          </button>

          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void handleSubmit()}
            disabled={submitting || !agreed}
          >
            Approve without Signature
          </button>

          <span className="text-[0.7rem] text-neutral-500">
            Your approval will be linked to this work order record.
          </span>
        </div>

        {/* Mount the modal host once */}
        <SignaturePad />
      </div>
    </div>
  );
}