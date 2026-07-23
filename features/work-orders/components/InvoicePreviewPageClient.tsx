//features/work-orders/components/InvoicePreviewPageClient.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import type { Database } from "@shared/types/types/supabase";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

import CustomerPaymentButton from "@/features/stripe/components/CustomerPaymentButton";
import { WorkOrderInvoiceDownloadButton } from "@work-orders/components/WorkOrderInvoiceDownloadButton";
import SyncInvoiceToQuickBooksButton from "@/features/integrations/quickbooks/components/SyncInvoiceToQuickBooksButton";
import RecordManualPayment from "@/features/invoices/components/RecordManualPayment";

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

  // ✅ needed to convert hours -> $
  labor_rate?: number;
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
type InspectionRow = DB["public"]["Tables"]["inspections"]["Row"];

type InvoiceLinePayload = {
  complaint?: string | null;
  cause?: string | null;
  correction?: string | null;
  labor_time?: string | number | null;
  lineId?: string;
};

type ActiveInvoiceVersionSummary = {
  id: string;
  invoice_id: string | null;
  lifecycle_status: string;
  currency: "CAD" | "USD";
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  paid_total: number;
  refunded_total: number;
  outstanding_total: number;
  snapshot?: InvoiceSnapshotView;
};

type SendInvoiceResponse = {
  ok?: boolean;
  error?: string;
  invoiceId?: string;
  invoiceVersion?: ActiveInvoiceVersionSummary;
};

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

function joinName(first?: string | null, last?: string | null): string | undefined {
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

function numOrUndef(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function safeMoney(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * PDF line-parts shape expected by WorkOrderInvoicePDF extractor:
 * { qty, name, unit_price, total }
 */
type PdfLinePart = {
  qty: number;
  name: string;
  unit_price: number;
  total: number;
};

type SnapshotPart = {
  lineId?: string;
  name?: string;
  qty?: number;
  unitPrice?: number;
  totalPrice?: number;
  partNumber?: string;
};

type SnapshotLine = {
  id: string;
  line_no?: number | null;
  description?: string | null;
  complaint?: string | null;
  labor_time?: number | null;
  resolvedLaborHours?: number;
  resolvedLaborRate?: number;
  resolvedLaborTotal?: number;
  resolvedPartsTotal?: number;
  resolvedLineTotal?: number;
};

type InvoiceSnapshotView = {
  currency?: "CAD" | "USD";
  laborCost?: number | null;
  partsCost?: number | null;
  shopSuppliesTotal?: number | null;
  subtotal?: number | null;
  discountTotal?: number | null;
  taxTotal?: number | null;
  taxRate?: number | null;
  total?: number | null;
  parts?: SnapshotPart[];
  lines?: SnapshotLine[];
};

function formatInvoiceMoney(
  value: unknown,
  invoiceCurrency: "CAD" | "USD",
): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: invoiceCurrency,
  }).format(safeMoney(value));
}

type InspectionPdfInfo = {
  inspectionId: string;
  pdfUrl?: string | null;
  storagePath?: string | null;
  finalizedAt?: string | null;
  createdAt?: string | null;
};

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
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"usd" | "cad">("usd");

  const [shopInfo, setShopInfo] = useState<ShopInfo | undefined>(undefined);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [canonicalSnapshot, setCanonicalSnapshot] =
    useState<InvoiceSnapshotView | null>(null);
  const [activeInvoiceVersion, setActiveInvoiceVersion] =
    useState<ActiveInvoiceVersionSummary | null>(null);
  const [canonicalInvoiceTotal, setCanonicalInvoiceTotal] = useState<number>(0);
  const [snapshotWarning, setSnapshotWarning] = useState<string | null>(null);

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewOk, setReviewOk] = useState<boolean>(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [fVehicleInfo, setFVehicleInfo] = useState<VehicleInfo | undefined>(
    undefined,
  );
  const [fCustomerInfo, setFCustomerInfo] = useState<CustomerInfo | undefined>(
    undefined,
  );

  // ✅ our fetched lines can include parts
  const [fLines, setFLines] = useState<
    Array<RepairLine & { lineId?: string; parts?: PdfLinePart[] }>
  >([]);

  const [fSummary, setFSummary] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);

  // ✅ inspection PDF (works even when no invoice exists yet)
  const [inspectionPdfLoading, setInspectionPdfLoading] = useState(false);
  const [inspectionPdf, setInspectionPdf] = useState<InspectionPdfInfo | null>(null);

  const effectiveVehicleInfo = vehicleInfo ?? fVehicleInfo;
  const effectiveCustomerInfo = customerInfo ?? fCustomerInfo;

  const effectiveLines = useMemo(() => {
    const provided = Array.isArray(lines) ? lines : undefined;
    return (
      (provided as
        | Array<RepairLine & { lineId?: string; parts?: PdfLinePart[] }>
        | undefined) ?? fLines
    );
  }, [lines, fLines]);

  const effectiveSummary = summary ?? fSummary;

  const effectiveShopName = useMemo(() => {
    const n = (shopInfo?.name ?? "").trim();
    return n.length ? n : undefined;
  }, [shopInfo?.name]);

  const derivedLaborTotal = useMemo(() => {
    const laborRate =
      typeof shopInfo?.labor_rate === "number" && Number.isFinite(shopInfo.labor_rate)
        ? shopInfo.labor_rate
        : 0;

    if (laborRate <= 0) return 0;

    return (effectiveLines ?? []).reduce((sum, line) => {
      const raw = (line as unknown as Record<string, unknown>)["labor_time"];
      const hours =
        typeof raw === "number"
          ? raw
          : typeof raw === "string"
            ? Number(raw)
            : 0;

      return sum + (Number.isFinite(hours) ? hours : 0) * laborRate;
    }, 0);
  }, [effectiveLines, shopInfo?.labor_rate]);

  const derivedPartsTotal = useMemo(() => {
    return (effectiveLines ?? []).reduce((sum, line) => {
      const parts = Array.isArray((line as { parts?: PdfLinePart[] }).parts)
        ? ((line as { parts?: PdfLinePart[] }).parts ?? [])
        : [];

      return (
        sum +
        parts.reduce((partSum, part) => {
          const total =
            typeof part.total === "number" && Number.isFinite(part.total)
              ? part.total
              : 0;
          return partSum + total;
        }, 0)
      );
    }, 0);
  }, [effectiveLines]);

  const derivedInvoiceTotal = useMemo(() => {
    return Math.max(0, derivedLaborTotal + derivedPartsTotal);
  }, [derivedLaborTotal, derivedPartsTotal]);

  const refreshInspectionPdf = useCallback(async (): Promise<void> => {
    if (!workOrderId) return;

    setInspectionPdfLoading(true);
    try {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, pdf_url, pdf_storage_path, finalized_at, created_at")
        .eq("work_order_id", workOrderId)
        .eq("is_canonical", true)
        .not("pdf_storage_path", "is", null)
        .order("finalized_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<
          Pick<
            InspectionRow,
            "id" | "pdf_url" | "pdf_storage_path" | "finalized_at" | "created_at"
          >
        >();

      if (error || !data?.id) {
        setInspectionPdf(null);
        return;
      }

      setInspectionPdf({
        inspectionId: data.id,
        pdfUrl: data.pdf_url ?? null,
        storagePath: data.pdf_storage_path ?? null,
        finalizedAt: data.finalized_at ?? null,
        createdAt: data.created_at ?? null,
      });
    } finally {
      setInspectionPdfLoading(false);
    }
  }, [supabase, workOrderId]);

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
        setShopId(null);
        setStripeAccountId(null);
        setCurrency("usd");
        setShopInfo(undefined);
        setLoading(false);
        return;
      }

      setShopId(woRow.shop_id);

      const { data: invoiceRow } = await supabase
        .from("invoices")
        .select("id")
        .eq("work_order_id", workOrderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (cancelled) return;
      setInvoiceId(invoiceRow?.id ?? null);
      const snapshotPartsByLine = new Map<string, PdfLinePart[]>();
      try {
        const snapshotRes = await fetch(`/api/work-orders/${workOrderId}/invoice`, { method: "GET" });
        const snapshotJson = (await snapshotRes.json().catch(() => null)) as
          | {
              snapshot?: InvoiceSnapshotView;
              activeInvoiceVersion?: ActiveInvoiceVersionSummary | null;
            }
          | null;
        const loadedSnapshot = snapshotJson?.snapshot ?? null;
        const loadedVersion = snapshotJson?.activeInvoiceVersion ?? null;
        const snapshotTotal = loadedSnapshot?.total;
        setCanonicalSnapshot(loadedSnapshot);
        setActiveInvoiceVersion(loadedVersion);
        if (loadedVersion?.invoice_id) setInvoiceId(loadedVersion.invoice_id);
        for (const part of loadedSnapshot?.parts ?? []) {
          const lineId = typeof part.lineId === "string" ? part.lineId.trim() : "";
          if (!lineId) continue;
          const qty = numOrUndef(part.qty) ?? 1;
          const unitPrice = safeMoney(part.unitPrice);
          const total = safeMoney(part.totalPrice);
          const baseName = trimOrUndef(part.name) ?? "Part";
          const partNumber = trimOrUndef(part.partNumber);
          const pretty = partNumber ? `${baseName} (${partNumber})` : baseName;
          snapshotPartsByLine.set(lineId, [
            ...(snapshotPartsByLine.get(lineId) ?? []),
            {
              qty: qty > 0 ? qty : 1,
              name: pretty,
              unit_price: unitPrice,
              total: total > 0 ? total : Math.max(0, (qty > 0 ? qty : 1) * unitPrice),
            },
          ]);
        }
        if (!snapshotRes.ok) {
          setSnapshotWarning("Using locally derived totals; canonical invoice snapshot is unavailable.");
          setCanonicalSnapshot(null);
          setActiveInvoiceVersion(null);
          setCanonicalInvoiceTotal(0);
        } else {
          setCanonicalInvoiceTotal(
            typeof snapshotTotal === "number" && Number.isFinite(snapshotTotal)
              ? Math.max(0, snapshotTotal)
              : 0,
          );
          setSnapshotWarning(null);
        }
      } catch {
        setSnapshotWarning("Using locally derived totals; canonical invoice snapshot is unavailable.");
        setCanonicalSnapshot(null);
        setActiveInvoiceVersion(null);
        setCanonicalInvoiceTotal(0);
      }

      // ✅ include labor_rate
      const { data: shop, error: sErr } = await supabase
        .from("shops")
        .select(
          "stripe_account_id, country, business_name, shop_name, name, phone_number, email, street, city, province, postal_code, labor_rate",
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
            | "labor_rate"
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
          labor_rate: numOrUndef(shop?.labor_rate),
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
        setFCustomerInfo({ name: trimOrUndef(woRow.customer_name) });
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
          year:
            v?.year !== null && v?.year !== undefined ? String(v.year) : undefined,
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
        // 1) load lines
        const { data: wol, error: wolErr } = await supabase
          .from("work_order_lines")
          .select("id, line_no, description, complaint, cause, correction, labor_time")
          .eq("work_order_id", workOrderId)
          .order("line_no", { ascending: true });

        if (cancelled) return;

        if (wolErr || !Array.isArray(wol) || wol.length === 0) {
          setFLines([]);
        } else {
          const perLine = snapshotPartsByLine;

          const mapped: Array<RepairLine & { lineId?: string; parts?: PdfLinePart[] }> = wol.map(
            (
              l: Pick<
                WorkOrderLineRow,
                "id" | "line_no" | "description" | "complaint" | "cause" | "correction" | "labor_time"
              >,
            ) => {
              const complaint = (l.description ?? l.complaint ?? "") || "";
              const id = typeof l.id === "string" && l.id.length > 0 ? l.id : undefined;

              return {
                complaint,
                cause: l.cause ?? "",
                correction: l.correction ?? "",
                labor_time: parseLaborTimeToNumber(l.labor_time),
                lineId: id,
                parts: id ? perLine.get(id) ?? [] : [],
              };
            },
          );

          setFLines(mapped);
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
  // Load inspection PDF for this work order (works even if no invoice exists yet)
  // -------------------------------------------------------------------
  useEffect(() => {
    void refreshInspectionPdf();
  }, [refreshInspectionPdf]);

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
          setReviewIssues([{ kind: "error", message: "Invoice review failed (bad response)" }]);
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

  const generalReviewIssues = useMemo(
    () => reviewIssues.filter((issue) => !issue.lineId),
    [reviewIssues],
  );

  const canTakeStripePayment = Boolean(shopId && stripeAccountId);
  const invoiceCurrency =
    activeInvoiceVersion?.currency ??
    canonicalSnapshot?.currency ??
    (currency.toUpperCase() as "CAD" | "USD");
  const outstandingTotal = Math.max(
    0,
    Number(activeInvoiceVersion?.outstanding_total ?? canonicalInvoiceTotal),
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const openInspectionPdf = useCallback((): void => {
    const url = (inspectionPdf?.pdfUrl ?? "").trim();
    if (!url) return;
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  }, [inspectionPdf?.pdfUrl]);

  const sendInvoiceEmail = useCallback(async () => {
    if (sending) return;
    if (!reviewOk) return;
    if (activeInvoiceVersion) return;

    const email = effectiveCustomerInfo?.email;
    if (!email) {
      setReviewOk(false);
      setReviewIssues([
        { kind: "missing_email", message: "No customer email on file for this work order." },
      ]);
      return;
    }

    const invoiceTotal = canonicalInvoiceTotal > 0 ? canonicalInvoiceTotal : derivedInvoiceTotal;

    const payloadLines: InvoiceLinePayload[] = (effectiveLines ?? []).map((l) => {
      const lineId = getLineIdFromRepairLine(l);
      const r = l as unknown as Record<string, unknown>;
      return {
        complaint: typeof r["complaint"] === "string" ? (r["complaint"] as string) : null,
        cause: typeof r["cause"] === "string" ? (r["cause"] as string) : null,
        correction: typeof r["correction"] === "string" ? (r["correction"] as string) : null,
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

      if (json.invoiceId) setInvoiceId(json.invoiceId);
      if (json.invoiceVersion) {
        setActiveInvoiceVersion(json.invoiceVersion);
        setCanonicalInvoiceTotal(Math.max(0, Number(json.invoiceVersion.total)));
        if (json.invoiceVersion.snapshot) {
          setCanonicalSnapshot(json.invoiceVersion.snapshot);
        }
      }
      await onSent?.();
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send invoice email";
      setReviewOk(false);
      setReviewError(msg);
      setReviewIssues([{ kind: "error", message: msg }]);
    } finally {
    