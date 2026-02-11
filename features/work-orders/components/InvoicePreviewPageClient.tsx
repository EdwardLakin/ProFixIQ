// features/work-orders/components/InvoicePreviewPageClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

import CustomerPaymentButton from "@/features/stripe/components/CustomerPaymentButton";
import { WorkOrderInvoiceDownloadButton } from "@work-orders/components/WorkOrderInvoiceDownloadButton";

type DB = Database;

type VehicleInfo = {
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
  license_plate?: string;
  unit_number?: string;
  mileage?: string;
  color?: string;
  engine_hours?: string;
};

type CustomerInfo = {
  name?: string;
  phone?: string;
  email?: string;
  business_name?: string;
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
};

type ShopInfo = {
  name?: string;
  phone_number?: string;
  email?: string;
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
};

type Props = {
  workOrderId: string;
  vehicleInfo?: VehicleInfo;
  customerInfo?: CustomerInfo;
  lines?: RepairLine[];
  summary?: string;
  signatureImage?: string;
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
  const r = line as unknown;
  if (!isRecord(r)) return undefined;

  const candidates = ["id", "lineId", "line_id", "work_order_line_id"];
  for (const k of candidates) {
    const v = r[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function joinName(
  first?: string | null,
  last?: string | null,
): string | undefined {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const s = [f, l].filter(Boolean).join(" ").trim();
  return s.length ? s : undefined;
}

function pickCustomerPhone(
  c?: Pick<CustomerRow, "phone" | "phone_number"> | null,
): string | undefined {
  const p1 = (c?.phone_number ?? "").trim();
  const p2 = (c?.phone ?? "").trim();
  const out = p1 || p2;
  return out.length ? out : undefined;
}

function pickCustomerName(
  c?: Pick<CustomerRow, "name" | "first_name" | "last_name"> | null,
  fallback?: string | null,
): string | undefined {
  const a = (c?.name ?? "").trim();
  const b = joinName(c?.first_name ?? null, c?.last_name ?? null);
  const f = (fallback ?? "").trim();
  const out = a || b || f;
  return out.length ? out : undefined;
}

function pickShopName(
  s?: Pick<ShopRow, "business_name" | "shop_name" | "name"> | null,
): string | undefined {
  const a = (s?.business_name ?? "").trim();
  const b = (s?.shop_name ?? "").trim();
  const c = (s?.name ?? "").trim();
  const out = a || b || c;
  return out.length ? out : undefined;
}

function trimOrUndef(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

function numToStringOrUndef(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim().length) return v.trim();
  return undefined;
}

export default function InvoicePreviewPageClient({
  workOrderId,
  vehicleInfo,
  customerInfo,
  lines,
  summary,
  signatureImage,
  onSent,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"usd" | "cad">("usd");

  const [shopInfo, setShopInfo] = useState<ShopInfo | undefined>(undefined);

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewOk, setReviewOk] = useState<boolean>(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);

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
    return provided ?? fLines;
  }, [lines, fLines]);

  const effectiveSummary = summary ?? fSummary;

  const effectiveShopName = useMemo(() => {
    const n = (shopInfo?.name ?? "").trim();
    return n.length ? n : undefined;
  }, [shopInfo?.name]);

  // -------------------------------------------------------------------
  // Load shop/stripe + WO + optional customer/vehicle/lines (when not provided)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!workOrderId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);

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

      if (cancelled) return;

      if (woErr || !woRow?.shop_id) {
        setWo(null);
        setShopId(null);
        setStripeAccountId(null);
        setCurrency("usd");
        setShopInfo(undefined);
        setLoading(false);
        return;
      }

      setWo(woRow);
      setShopId(woRow.shop_id);

      const { data: shop, error: sErr } = await supabase
        .from("shops")
        .select(
          "stripe_account_id, country, business_name, shop_name, name, phone_number, email, street, city, province, postal_code",
        )
        .eq("id", woRow.shop_id)
        .maybeSingle<
          Pick<
            ShopRow,
            | "stripe_account_id"
            | "country"
            | "business_name"
            | "shop_name"
            | "name"
            | "phone_number"
            | "email"
            | "street"
            | "city"
            | "province"
            | "postal_code"
          >
        >();

      if (cancelled) return;

      if (sErr) {
        setStripeAccountId(null);
        setCurrency("usd");
        setShopInfo(undefined);
      } else {
        setStripeAccountId(shop?.stripe_account_id ?? null);
        setCurrency(normalizeCurrencyFromCountry(shop?.country));
        setShopInfo({
          name: pickShopName(shop ?? null),
          phone_number: trimOrUndef(shop?.phone_number),
          email: trimOrUndef(shop?.email),
          street: trimOrUndef(shop?.street),
          city: trimOrUndef(shop?.city),
          province: trimOrUndef(shop?.province),
          postal_code: trimOrUndef(shop?.postal_code),
        });
      }

      const needCustomer = !customerInfo;
      const needVehicle = !vehicleInfo;
      const needLines = !Array.isArray(lines);
      const needSummary = typeof summary !== "string";

      if (needCustomer && woRow.customer_id) {
        const { data: c } = await supabase
          .from("customers")
          .select(
            "name, first_name, last_name, phone, phone_number, email, business_name, street, city, province, postal_code",
          )
          .eq("id", woRow.customer_id)
          .maybeSingle<
            Pick<
              CustomerRow,
              | "name"
              | "first_name"
              | "last_name"
              | "phone"
              | "phone_number"
              | "email"
              | "business_name"
              | "street"
              | "city"
              | "province"
              | "postal_code"
            >
          >();

        if (cancelled) return;

        setFCustomerInfo({
          name: pickCustomerName(c ?? null, woRow.customer_name ?? null),
          phone: pickCustomerPhone(c ?? null),
          email: trimOrUndef(c?.email),
          business_name: trimOrUndef(c?.business_name),
          street: trimOrUndef(c?.street),
          city: trimOrUndef(c?.city),
          province: trimOrUndef(c?.province),
          postal_code: trimOrUndef(c?.postal_code),
        });
      } else if (needCustomer) {
        setFCustomerInfo({
          name: trimOrUndef(woRow.customer_name),
        });
      }

      if (needVehicle && woRow.vehicle_id) {
        const { data: v } = await supabase
          .from("vehicles")
          .select(
            "year, make, model, vin, license_plate, unit_number, mileage, color, engine_hours",
          )
          .eq("id", woRow.vehicle_id)
          .maybeSingle<
            Pick<
              VehicleRow,
              | "year"
              | "make"
              | "model"
              | "vin"
              | "license_plate"
              | "unit_number"
              | "mileage"
              | "color"
              | "engine_hours"
            >
          >();

        if (cancelled) return;

        setFVehicleInfo({
          year: v?.year !== null && v?.year !== undefined ? String(v.year) : undefined,
          make: trimOrUndef(v?.make),
          model: trimOrUndef(v?.model),
          vin: trimOrUndef(v?.vin),
          license_plate: trimOrUndef(v?.license_plate),
          unit_number: trimOrUndef(v?.unit_number),
          mileage: numToStringOrUndef(v?.mileage),
          color: trimOrUndef(v?.color),
          engine_hours: numToStringOrUndef(v?.engine_hours),
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
              const complaint = (l.description ?? l.complaint ?? "") || "";
              return {
                complaint,
                cause: l.cause ?? "",
                correction: l.correction ?? "",
                labor_time: parseLaborTimeToNumber(l.labor_time),
                lineId: l.id,
              };
            },
          );
          setFLines(mapped);
        } else {
          setFLines([]);
        }
      }

      if (needSummary) setFSummary(undefined);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [workOrderId, supabase, customerInfo, vehicleInfo, lines, summary]);

  // -------------------------------------------------------------------
  // Invoice review gate (runs on mount / id change)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!workOrderId) return;

    let cancelled = false;

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

        if (cancelled) return;

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
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Invoice review failed";
        setReviewOk(false);
        setReviewError(msg);
        setReviewIssues([{ kind: "error", message: msg }]);
      } finally {
        if (!cancelled) setReviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workOrderId]);

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

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

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

    const payloadLines: InvoiceLinePayload[] = (effectiveLines ?? []).map((l) => {
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
          shopName: effectiveShopName,
          invoiceTotal,
          vehicleInfo: effectiveVehicleInfo,
          lines: payloadLines,
          signatureImage: signatureImage ?? undefined,
        }),
      });

      const json = (await res.json().catch(() => null)) as SendInvoiceResponse | null;

      if (!res.ok || !json?.ok) {
        const msg = json?.error ?? "Failed to send invoice email";
        throw new Error(msg);
      }

      await onSent?.();
      handleBack();
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
    handleBack,
    signatureImage,
    effectiveShopName,
  ]);

  return (
    <div className="min-h-[calc(100vh-0px)] bg-black px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
        {/* Top action row */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--metal-border-soft)] bg-black/35 px-3 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5 active:scale-95"
            >
              Back
            </button>

            <div className="text-[0.7rem] uppercase tracking-[0.22em] text-neutral-300">
              Invoice
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

          <div className="flex items-center gap-2">
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
                  : "Blocked until required info is complete"
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
            ) : null}
          </div>
        </div>

        {/* Review issues panel */}
        {!reviewOk ? (
          <div className="rounded-xl border border-amber-500/30 bg-black/35 px-3 py-2">
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-amber-200">
              Invoice blocked
            </div>
            <div className="mt-1 text-[0.75rem] text-neutral-300">
              Fix the items below, then refresh this page.
            </div>

            {reviewError ? (
              <div className="mt-2 text-[0.75rem] text-red-200">{reviewError}</div>
            ) : null}

            <ul className="mt-2 space-y-1 text-[0.8rem] text-neutral-200">
              {(reviewIssues ?? []).slice(0, 12).map((i, idx) => (
                <li key={`${i.kind}-${idx}`} className="flex gap-2">
                  <span className="text-amber-300">•</span>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>

            {issuesByLineId.size > 0 ? (
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
                            {list.slice(0, 3).map((it, idx2) => (
                              <div key={`${id}-${idx2}`}>• {it.message}</div>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* PDF Download Panel */}
        <div className="rounded-xl border border-[var(--metal-border-soft)] bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                Invoice PDF
              </div>
              <div className="mt-1 text-sm text-neutral-200">
                Download a copy for your records.
              </div>
            </div>

            <div className={reviewOk ? "" : "opacity-60 pointer-events-none"}>
              <WorkOrderInvoiceDownloadButton
                workOrderId={workOrderId}
                lines={effectiveLines}
                summary={effectiveSummary}
                vehicleInfo={effectiveVehicleInfo}
                customerInfo={effectiveCustomerInfo}
                autoTrigger={false}
              />
            </div>
          </div>

          {!reviewOk ? (
            <div className="mt-3 text-[0.75rem] text-amber-200">
              PDF download is shown, but invoice is still blocked until required
              info is complete.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}