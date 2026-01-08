"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

import ModalShell from "@/features/shared/components/ModalShell";
import { WorkOrderInvoicePDF } from "@work-orders/components/WorkOrderInvoicePDF";
import CustomerPaymentButton from "@/features/stripe/components/CustomerPaymentButton";

type DB = Database;

type VehicleInfo = { year?: string; make?: string; model?: string; vin?: string };
type CustomerInfo = { name?: string; phone?: string; email?: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;

  // ✅ Backwards compatible: still accepts precomputed props,
  // but will auto-fetch if omitted.
  vehicleInfo?: VehicleInfo;
  customerInfo?: CustomerInfo;
  lines?: RepairLine[];
  summary?: string;
  signatureImage?: string;

  // ✅ Optional callback when invoice is successfully emailed
  onSent?: () => void | Promise<void>;
};

function normalizeCurrencyFromCountry(country: unknown): "usd" | "cad" {
  const c = String(country ?? "").trim().toUpperCase();
  return c === "CA" ? "cad" : "usd";
}

type ReviewIssue = { kind: string; lineId?: string; message: string };
type ReviewResponse = { ok: boolean; issues: ReviewIssue[] };

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

type InvoiceLinePayload = {
  complaint?: string | null;
  cause?: string | null;
  correction?: string | null;
  labor_time?: string | number | null;
  // helpful for review linking (if your review emits lineId)
  lineId?: string;
};

type SendInvoiceResponse = { ok?: boolean; error?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function parseLaborTimeToNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

function getLineIdFromRepairLine(line: RepairLine): string | undefined {
  // support a few common shapes without using `any`
  const r = line as unknown;
  if (!isRecord(r)) return undefined;

  const candidates = ["id", "lineId", "line_id", "work_order_line_id"];
  for (const k of candidates) {
    const v = r[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export default function InvoicePreviewModal({
  isOpen,
  onClose,
  workOrderId,
  vehicleInfo,
  customerInfo,
  lines,
  summary,
  signatureImage,
  onSent,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"usd" | "cad">("usd");

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewOk, setReviewOk] = useState<boolean>(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // ✅ auto-fetched payloads (only used when props are not provided)
  const [wo, setWo] = useState<
    Pick<
      WorkOrderRow,
      | "id"
      | "shop_id"
      | "customer_id"
      | "vehicle_id"
      | "labor_total"
      | "parts_total"
      | "invoice_total"
      | "customer_name"
    > | null
  >(null);

  const [fVehicleInfo, setFVehicleInfo] = useState<VehicleInfo | undefined>(
    undefined,
  );
  const [fCustomerInfo, setFCustomerInfo] = useState<CustomerInfo | undefined>(
    undefined,
  );
  const [fLines, setFLines] = useState<Array<RepairLine & { lineId?: string }>>(
    [],
  );
  const [fSummary, setFSummary] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);

  const effectiveVehicleInfo = vehicleInfo ?? fVehicleInfo;
  const effectiveCustomerInfo = customerInfo ?? fCustomerInfo;
  const effectiveLines = useMemo(() => {
    const provided = Array.isArray(lines) ? lines : undefined;
    if (provided) return provided;
    return fLines;
  }, [lines, fLines]);
  const effectiveSummary = summary ?? fSummary;

  // -------------------------------------------------------------------
  // Load shop / stripe info + (optional) WO + customer/vehicle/lines when missing
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);

    (async () => {
      // Always fetch WO core so we can send invoice email from here safely
      const { data: woRow, error: woErr } = await supabase
        .from("work_orders")
        .select(
          "id, shop_id, customer_id, vehicle_id, labor_total, parts_total, invoice_total, customer_name",
        )
        .eq("id", workOrderId)
        .maybeSingle<
          Pick<
            WorkOrderRow,
            | "id"
            | "shop_id"
            | "customer_id"
            | "vehicle_id"
            | "labor_total"
            | "parts_total"
            | "invoice_total"
            | "customer_name"
          >
        >();

      if (woErr || !woRow?.shop_id) {
        setWo(null);
        setShopId(null);
        setStripeAccountId(null);
        setCurrency("usd");
        setLoading(false);
        return;
      }

      setWo(woRow);
      setShopId(woRow.shop_id);

      // Shop → stripe connect + country
      const { data: shop, error: sErr } = await supabase
        .from("shops")
        .select("stripe_account_id, country")
        .eq("id", woRow.shop_id)
        .maybeSingle<Pick<ShopRow, "stripe_account_id" | "country">>();

      if (sErr) {
        setStripeAccountId(null);
        setCurrency("usd");
      } else {
        setStripeAccountId(shop?.stripe_account_id ?? null);
        setCurrency(normalizeCurrencyFromCountry(shop?.country));
      }

      // Only fetch these if not passed in
      const needCustomer = !customerInfo;
      const needVehicle = !vehicleInfo;
      const needLines = !Array.isArray(lines);
      const needSummary = typeof summary !== "string";

      if (needCustomer && woRow.customer_id) {
        const { data: c } = await supabase
          .from("customers")
          .select("first_name,last_name,phone,email")
          .eq("id", woRow.customer_id)
          .maybeSingle<
            Pick<CustomerRow, "first_name" | "last_name" | "phone" | "email">
          >();

        const customerName =
          [c?.first_name ?? "", c?.last_name ?? ""].filter(Boolean).join(" ") ||
          woRow.customer_name ||
          undefined;

        setFCustomerInfo({
          name: customerName,
          phone: c?.phone ?? undefined,
          email: c?.email ?? undefined,
        });
      } else if (needCustomer) {
        // fallback
        setFCustomerInfo({
          name: woRow.customer_name ?? undefined,
        });
      }

      if (needVehicle && woRow.vehicle_id) {
        const { data: v } = await supabase
          .from("vehicles")
          .select("year,make,model,vin")
          .eq("id", woRow.vehicle_id)
          .maybeSingle<Pick<VehicleRow, "year" | "make" | "model" | "vin">>();

        setFVehicleInfo({
          year: v?.year ? String(v.year) : undefined,
          make: v?.make ?? undefined,
          model: v?.model ?? undefined,
          vin: v?.vin ?? undefined,
        });
      } else if (needVehicle) {
        setFVehicleInfo(undefined);
      }

      if (needLines) {
        const { data: wol, error: wolErr } = await supabase
          .from("work_order_lines")
          .select("id, line_no, description, complaint, cause, correction, labor_time")
          .eq("work_order_id", workOrderId)
          .order("line_no", { ascending: true });

        if (!wolErr && Array.isArray(wol)) {
          const mapped: Array<RepairLine & { lineId?: string }> = wol.map(
            (
              l: Pick<
                WorkOrderLineRow,
                | "id"
                | "line_no"
                | "description"
                | "complaint"
                | "cause"
                | "correction"
                | "labor_time"
              >,
            ) => {
              // Map to RepairLine-compatible shape
              const complaint = (l.description ?? l.complaint ?? "") || "";

              const out: RepairLine & { lineId?: string } = {
                complaint,
                cause: l.cause ?? "",
                correction: l.correction ?? "",
                // ✅ PATCH: ensure number | undefined, not string | number
                labor_time: parseLaborTimeToNumber(l.labor_time),
                lineId: l.id,
              };
              return out;
            },
          );
          setFLines(mapped);
        } else {
          setFLines([]);
        }
      }

      if (needSummary) {
        // leave summary as-is if you already compute it elsewhere; safe default:
        setFSummary(undefined);
      }

      setLoading(false);
    })();
  }, [isOpen, supabase, workOrderId, customerInfo, vehicleInfo, lines, summary]);

  // -------------------------------------------------------------------
  // 🔒 Invoice review gate (runs every time modal opens)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    setReviewLoading(true);
    setReviewError(null);
    setReviewIssues([]);
    setReviewOk(false);

    (async () => {
      try {
        const res = await fetch(`/api/work-orders/${workOrderId}/invoice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const json = (await res.json().catch(() => null)) as ReviewResponse | null;

        if (!res.ok || !json) {
          setReviewOk(false);
          setReviewIssues([
            { kind: "error", message: "Invoice review failed (bad response)" },
          ]);
          return;
        }

        setReviewOk(Boolean(json.ok));
        setReviewIssues(Array.isArray(json.issues) ? json.issues : []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invoice review failed";
        setReviewOk(false);
        setReviewError(msg);
        setReviewIssues([{ kind: "error", message: msg }]);
      } finally {
        setReviewLoading(false);
      }
    })();
  }, [isOpen, workOrderId]);

  // -------------------------------------------------------------------
  // Derived: issue grouping per lineId (for indicators)
  // -------------------------------------------------------------------
  const issuesByLineId = useMemo(() => {
    const map = new Map<string, ReviewIssue[]>();
    for (const i of reviewIssues) {
      if (!i.lineId) continue;
      const arr = map.get(i.lineId) ?? [];
      arr.push(i);
      map.set(i.lineId, arr);
    }
    return map;
  }, [reviewIssues]);

  const canTakePayment = Boolean(shopId && stripeAccountId);
  const canProceed = canTakePayment && reviewOk && !reviewLoading;

  const sendInvoiceEmail = useCallback(async () => {
    if (sending) return;
    if (!reviewOk) return;

    const email = effectiveCustomerInfo?.email;
    if (!email) {
      setReviewOk(false);
      setReviewIssues([
        {
          kind: "missing_email",
          message: "No customer email on file for this work order.",
        },
      ]);
      return;
    }

    const laborTotal = Number(wo?.labor_total ?? 0);
    const partsTotal = Number(wo?.parts_total ?? 0);
    const invoiceTotal =
      Number(wo?.invoice_total ?? 0) > 0
        ? Number(wo?.invoice_total ?? 0)
        : laborTotal + partsTotal;

    // Prepare sendgrid-friendly payload (typed)
    const payloadLines: InvoiceLinePayload[] = (effectiveLines ?? []).map((l) => {
      // ✅ PATCH: remove l["lineId"] indexing (caused implicit-any + type error)
      const lineId = getLineIdFromRepairLine(l);

      const r = l as unknown as Record<string, unknown>;
      return {
        complaint: typeof r["complaint"] === "string" ? (r["complaint"] as string) : null,
        cause: typeof r["cause"] === "string" ? (r["cause"] as string) : null,
        correction:
          typeof r["correction"] === "string" ? (r["correction"] as string) : null,
        labor_time:
          typeof r["labor_time"] === "number"
            ? (r["labor_time"] as number)
            : typeof r["labor_time"] === "string"
              ? (r["labor_time"] as string)
              : null,
        lineId,
      };
    });

    try {
      setSending(true);

      const res = await fetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          customerEmail: email,
          customerName: effectiveCustomerInfo?.name,
          invoiceTotal,
          vehicleInfo: effectiveVehicleInfo,
          lines: payloadLines,
        }),
      });

      const json = (await res.json().catch(() => null)) as SendInvoiceResponse | null;

      if (!res.ok || !json?.ok) {
        const msg = json?.error ?? "Failed to send invoice email";
        throw new Error(msg);
      }

      await onSent?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send invoice email";
      setReviewOk(false);
      setReviewError(msg);
      setReviewIssues([{ kind: "error", message: msg }]);
    } finally {
      setSending(false);
    }
  }, [
    sending,
    reviewOk,
    effectiveCustomerInfo?.email,
    effectiveCustomerInfo?.name,
    effectiveVehicleInfo,
    effectiveLines,
    workOrderId,
    wo?.labor_total,
    wo?.parts_total,
    wo?.invoice_total,
    onSent,
    onClose,
  ]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="INVOICE PREVIEW"
      size="xl"
      hideFooter
      bodyScrollable={false}
    >
      <div className="flex h-[78vh] flex-col gap-3">
        {/* Top action row */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--metal-border-soft)] bg-black/35 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="text-[0.7rem] uppercase tracking-[0.22em] text-neutral-300">
              Work Order
              <span className="ml-2 rounded-full border border-[var(--metal-border-soft)] bg-black/40 px-2 py-0.5 text-[0.65rem] text-neutral-200">
                #{workOrderId}
              </span>
            </div>

            {loading ? (
              <span className="text-[0.7rem] text-neutral-400">Loading shop…</span>
            ) : canTakePayment ? (
              <span className="text-[0.7rem] text-neutral-400">
                Payments enabled ({currency.toUpperCase()})
              </span>
            ) : (
              <span className="text-[0.7rem] text-neutral-500">
                Payments unavailable (shop not connected)
              </span>
            )}

            {reviewLoading ? (
              <span className="text-[0.7rem] text-neutral-400">Reviewing…</span>
            ) : reviewOk ? (
              <span className="text-[0.7rem] text-emerald-300">Invoice ready</span>
            ) : (
              <span className="text-[0.7rem] text-amber-300">Missing required info</span>
            )}
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-2">
            {/* ✅ Send invoice (gated by review) */}
            <button
              type="button"
              onClick={() => void sendInvoiceEmail()}
              disabled={!reviewOk || reviewLoading || sending}
              className={
                "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] shadow-[0_0_12px_rgba(212,118,49,0.35)] " +
                (reviewOk && !reviewLoading
                  ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black hover:brightness-110"
                  : "border border-amber-500/40 bg-amber-500/10 text-amber-200 opacity-60")
              }
              title={
                reviewOk
                  ? "Email invoice (SendGrid)"
                  : "Invoice blocked until required info is complete"
              }
            >
              {sending ? "Sending…" : "Send invoice"}
            </button>

            {canTakePayment && (
              <div className={canProceed ? "" : "opacity-50 pointer-events-none"}>
                <CustomerPaymentButton
                  shopId={shopId as string}
                  stripeAccountId={stripeAccountId as string}
                  currency={currency}
                  workOrderId={workOrderId}
                />
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>

        {/* Review issues panel (only shows if blocked) */}
        {!reviewOk && (
          <div className="rounded-xl border border-amber-500/30 bg-black/35 px-3 py-2">
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-amber-200">
              Invoice blocked
            </div>
            <div className="mt-1 text-[0.75rem] text-neutral-300">
              Fix the items below, then reopen the invoice preview.
            </div>

            {reviewError && (
              <div className="mt-2 text-[0.75rem] text-red-200">{reviewError}</div>
            )}

            <ul className="mt-2 space-y-1 text-[0.8rem] text-neutral-200">
              {(reviewIssues ?? []).slice(0, 12).map((i, idx) => (
                <li key={`${i.kind}-${idx}`} className="flex gap-2">
                  <span className="text-amber-300">•</span>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>

            {/* ✅ Line indicators (only if review returns lineId) */}
            {issuesByLineId.size > 0 && (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-300">
                  Line issues
                </div>
                <ul className="mt-2 space-y-2 text-[0.8rem] text-neutral-200">
                  {(effectiveLines ?? [])
                    .map((l) => ({ l, id: getLineIdFromRepairLine(l) }))
                    .filter((x) => !!x.id && issuesByLineId.has(x.id as string))
                    .slice(0, 10)
                    .map(({ l, id }) => {
                      const list = issuesByLineId.get(id as string) ?? [];
                      const r = l as unknown as Record<string, unknown>;
                      const label =
                        typeof r["complaint"] === "string" &&
                        (r["complaint"] as string).trim().length > 0
                          ? (r["complaint"] as string)
                          : `Line ${String(id).slice(0, 6)}…`;

                      return (
                        <li
                          key={`line-issue-${id}`}
                          className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-amber-300">⚠</span>
                            <span className="font-medium">{label}</span>
                          </div>
                          <div className="mt-1 space-y-0.5 pl-6 text-neutral-300">
                            {list.slice(0, 3).map((it, idx) => (
                              <div key={`${id}-${idx}`}>• {it.message}</div>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Mobile payment row */}
        <div className="md:hidden flex items-center justify-between gap-2 rounded-xl border border-[var(--metal-border-soft)] bg-black/35 px-3 py-2">
          <button
            type="button"
            onClick={() => void sendInvoiceEmail()}
            disabled={!reviewOk || reviewLoading || sending}
            className={
              "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] " +
              (reviewOk && !reviewLoading
                ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black hover:brightness-110"
                : "border border-amber-500/40 bg-amber-500/10 text-amber-200 opacity-60")
            }
          >
            {sending ? "Sending…" : "Send invoice"}
          </button>

          {canTakePayment ? (
            <div className={canProceed ? "" : "opacity-50 pointer-events-none"}>
              <CustomerPaymentButton
                shopId={shopId as string}
                stripeAccountId={stripeAccountId as string}
                currency={currency}
                workOrderId={workOrderId}
              />
            </div>
          ) : (
            <span className="text-[0.7rem] text-neutral-500">
              Connect Stripe to accept payments
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5 active:scale-95"
          >
            Close
          </button>
        </div>

        {/* PDF Surface */}
        <div className="flex-1 overflow-hidden rounded-xl border border-[var(--metal-border-soft)] bg-black/30">
          <PDFViewer width="100%" height="100%">
            <WorkOrderInvoicePDF
              workOrderId={workOrderId}
              vehicleInfo={effectiveVehicleInfo}
              customerInfo={effectiveCustomerInfo}
              lines={effectiveLines}
              summary={effectiveSummary}
              signatureImage={signatureImage}
            />
          </PDFViewer>
        </div>
      </div>
    </ModalShell>
  );
}