//app/work-orders/[id]/approve/page.tsx

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

function getJobTypeLabel(raw: unknown): string {
  if (typeof raw !== "string") return "Job";
  const clean = raw.replaceAll("_", " ").trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : "Job";
}

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

        const safeLines = (lineRows as Line[] | null) ?? [];
        setWo((woRow as WorkOrder | null) ?? null);
        setLines(safeLines);
        setApproved(new Set(safeLines.map((l) => l.id)));

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

  // Canonical labor pricing source is shops.labor_rate (owner/shop settings).
  const hourlyRate = getNum(shop, "labor_rate") ?? 0;
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
  const hours = approvedLines.reduce<number>((sum, l) => sum + (typeof l.labor_time === "number" ? l.labor_time : 0), 0);
  const laborTotal = hours * hourlyRate;
  const partsTotal = approvedLines.reduce<number>((sum, l) => sum + (getNum(l, "parts_total") ?? 0), 0);
  const grandTotal = laborTotal + partsTotal;

  async function handleSubmit(signatureDataUrl?: string) {
    if (!id) return;
    setSubmitting(true);
    setErr(null);

    try {
      let signatureUrl: string | null = savedSigUrl;
      if (signatureDataUrl) {
        const uploaded = await uploadSignatureImage(signatureDataUrl, id);
        signatureUrl = uploaded;
        setSavedSigUrl(uploaded);
      }

      const approvedLineIds: string[] = Array.from(approved);
      const declinedLineIds: string[] = lines.map((l) => l.id).filter((x) => !approved.has(x));

      const res = await fetch("/api/quotes/approval-webhook", {
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
      if (!res.ok) throw new Error(j?.error ?? "Failed to submit approval");

      router.replace(`/work-orders/confirm?woId=${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-800/80" />
          <div className="h-24 animate-pulse rounded-2xl bg-slate-900/80" />
        </div>
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-red-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
          Work order not found.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Approval review</p>
              <h1 className="text-xl font-semibold text-slate-100">{shop?.name ?? "ProFixIQ Work Order"}</h1>
              <p className="text-sm text-slate-300">Review selected items, confirm totals, and submit your decision.</p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Estimate total</p>
              <p className="text-lg font-semibold text-[var(--accent-copper-light)]">{fmt.format(grandTotal)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Work order</span>
              <div className="font-medium text-slate-100">{wo.custom_id ?? `#${wo.id.slice(0, 8)}`}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Selected labor</span>
              <div className="font-medium text-slate-100">{hours.toFixed(1)}h</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Currency</span>
              <div className="font-medium text-slate-100">{currencyCode}</div>
            </div>
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <p className="font-semibold">Approval action failed</p>
              <p className="mt-1 text-red-100/90">{err}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_14px_42px_rgba(2,6,23,0.35)]">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Approval items</h2>
              <p className="text-sm text-slate-400">Select the work you want approved. Unselected lines will be declined.</p>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">No items available for approval.</div>
          ) : (
            <div className="space-y-2">
              {lines.map((l) => {
                const isSelected = approved.has(l.id);
                const lineHours = typeof l.labor_time === "number" ? l.labor_time : 0;
                const lineLabor = lineHours * hourlyRate;
                const lineParts = getNum(l, "parts_total") ?? 0;
                const lineTotal = lineLabor + lineParts;

                return (
                  <label
                    key={l.id}
                    className={`block cursor-pointer rounded-xl border px-4 py-3 transition ${
                      isSelected
                        ? "border-sky-400/40 bg-sky-500/10"
                        : "border-slate-700 bg-slate-950/70 hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-500 bg-slate-950 text-[var(--accent-copper)] focus:ring-[var(--accent-copper)]"
                          checked={isSelected}
                          onChange={() => toggle(l.id)}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">{l.description || l.complaint || "Untitled item"}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            <span>{getJobTypeLabel(l.job_type)}</span>
                            <span>Labor {lineHours > 0 ? `${lineHours.toFixed(1)}h` : "—"}</span>
                            <span>{isSelected ? "Selected" : "Not selected"}</span>
                          </div>
                          {l.correction ? (
                            <p className="mt-2 line-clamp-2 text-xs text-slate-300/90">
                              <span className="font-medium text-slate-200">Correction:</span> {l.correction}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-right text-xs">
                        <p className="text-slate-400">Line total</p>
                        <p className="text-sm font-semibold text-slate-100">{fmt.format(lineTotal)}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_14px_42px_rgba(2,6,23,0.35)]">
          <h2 className="text-base font-semibold text-slate-100">Totals</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span>Labor ({hours.toFixed(1)}h @ {fmt.format(hourlyRate)}/hr)</span>
              <span className="font-medium text-slate-100">{fmt.format(laborTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Parts</span>
              <span className="font-medium text-slate-100">{fmt.format(partsTotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-700 pt-2">
              <span className="font-semibold text-slate-100">Total</span>
              <span className="text-base font-semibold text-[var(--accent-copper-light)]">{fmt.format(grandTotal)}</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_14px_42px_rgba(2,6,23,0.35)]">
          <LegalTerms onAgreeChange={setAgreed} defaultOpen />
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_14px_42px_rgba(2,6,23,0.35)]">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-lg bg-[var(--accent-copper)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-copper-light)] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={async () => {
                const base64: string | null = await openSignaturePad({ shopName: shop?.name || "" });
                if (base64) await handleSubmit(base64);
              }}
              disabled={submitting || !agreed}
              title={!agreed ? "Please agree to the Terms & Conditions" : "Sign & Submit"}
            >
              {submitting ? "Submitting…" : "Sign & approve"}
            </button>

            <button
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleSubmit()}
              disabled={submitting || !agreed}
            >
              Approve without signature
            </button>

            <p className="text-xs text-slate-400">Your approval will be linked to this work order record.</p>
          </div>
        </section>

        <SignaturePad />
      </div>
    </div>
  );
}
