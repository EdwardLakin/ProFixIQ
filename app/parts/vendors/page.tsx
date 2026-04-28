"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

type DB = Database;
type SupplierRow = DB["public"]["Tables"]["suppliers"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type PurchaseOrderRow = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderLineRow = DB["public"]["Tables"]["purchase_order_lines"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];

type VendorDirectoryItem = {
  supplier: SupplierRow;
  linkedPartsCount: number;
  openPoCount: number;
  pendingReceivingCount: number;
  lastActivityAt: string | null;
  readiness: "Ready" | "Missing contact" | "Missing account/code" | "No linked parts" | "Needs review";
  issues: string[];
};

type DerivedState = {
  totalVendors: number | null;
  vendorsWithLinkedParts: number | null;
  vendorsMissingContact: number | null;
  vendorsMissingAccount: number | null;
  vendorsMissingContactOrAccount: number | null;
  partsMissingVendorLink: number | null;
  openPurchaseOrders: number | null;
  pendingReceivingQueue: number | null;
  duplicateVendorCandidates: number | null;
  partsWithSupplierTextNoCanonicalLink: number | null;
  poItemsWithVendorTextNoVendorLink: number | null;
  openPoWithoutVendorRecord: number | null;
  integrationReadiness: {
    partsTech: string;
    quickBooks: string;
    supplierApi: string;
  };
  warnings: string[];
};

const OPEN_PO_STATUSES = ["draft", "open", "sent", "ordered", "partially_received", "receiving"];

function norm(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[\s\-_.]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function hasValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function readinessForVendor(v: VendorDirectoryItem): VendorDirectoryItem["readiness"] {
  const missingContact = !hasValue(v.supplier.email) && !hasValue(v.supplier.phone);
  const missingAccount = !hasValue(v.supplier.account_no);
  const noLinkedParts = v.linkedPartsCount === 0;

  if (!missingContact && !missingAccount && !noLinkedParts) return "Ready";
  if (missingContact && missingAccount) return "Needs review";
  if (missingContact) return "Missing contact";
  if (missingAccount) return "Missing account/code";
  return "No linked parts";
}

function readinessTone(readiness: VendorDirectoryItem["readiness"]): string {
  if (readiness === "Ready") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (readiness === "Needs review") return "border-rose-500/35 bg-rose-500/10 text-rose-200";
  if (readiness === "No linked parts") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-sky-500/35 bg-sky-500/10 text-sky-200";
}

function formatCount(v: number | null): string {
  if (v == null) return "Not available";
  return v.toLocaleString();
}

function formatDate(v: string | null): string {
  if (!v) return "No activity";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "No activity";
  return d.toLocaleDateString();
}

async function resolveShopId(supabase: ReturnType<typeof createClientComponentClient<DB>>): Promise<string> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  if (!uid) return "";
  const { data: profA } = await supabase.from("profiles").select("shop_id").eq("user_id", uid).maybeSingle();
  if (profA?.shop_id) return String(profA.shop_id);
  const { data: profB } = await supabase.from("profiles").select("shop_id").eq("id", uid).maybeSingle();
  return String(profB?.shop_id ?? "");
}

async function fetchAllRows<T>(fetchPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const rows = await fetchPage(from, to);
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function KpiCard({ title, value, hint, href }: { title: string; value: string; hint?: string; href?: string }) {
  const content = (
    <div className={`${ui.itemCard} px-4 py-3`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );

  if (!href) return content;
  return <Link href={href} className="block">{content}</Link>;
}

export default function PartsVendorsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shopId, setShopId] = useState("");

  const [vendors, setVendors] = useState<SupplierRow[]>([]);
  const [directory, setDirectory] = useState<VendorDirectoryItem[]>([]);
  const [derived, setDerived] = useState<DerivedState>({
    totalVendors: null,
    vendorsWithLinkedParts: null,
    vendorsMissingContact: null,
    vendorsMissingAccount: null,
    vendorsMissingContactOrAccount: null,
    partsMissingVendorLink: null,
    openPurchaseOrders: null,
    pendingReceivingQueue: null,
    duplicateVendorCandidates: null,
    partsWithSupplierTextNoCanonicalLink: null,
    poItemsWithVendorTextNoVendorLink: null,
    openPoWithoutVendorRecord: null,
    integrationReadiness: {
      partsTech: "Not enough baseline vendor + parts linkage data yet.",
      quickBooks: "Vendor master completeness is not yet sufficient for deterministic sync prep.",
      supplierApi: "PO/receiving linkage coverage is incomplete.",
    },
    warnings: [],
  });

  const [search, setSearch] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<string>("all");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);

      const sid = await resolveShopId(supabase);
      setShopId(sid);

      if (!sid) {
        setError("Unable to resolve shop context.");
        setLoading(false);
        return;
      }

      const warnings: string[] = [];

      const vendorCountQ = supabase.from("suppliers").select("id", { head: true, count: "exact" }).eq("shop_id", sid);
      const openPoCountQ = supabase
        .from("purchase_orders")
        .select("id", { head: true, count: "exact" })
        .eq("shop_id", sid)
        .in("status", OPEN_PO_STATUSES);

      const [vendorCountRes, openPoCountRes] = await Promise.all([vendorCountQ, openPoCountQ]);

      if (vendorCountRes.error) warnings.push(`Total vendors unavailable: ${vendorCountRes.error.message}`);
      if (openPoCountRes.error) warnings.push(`Open PO count unavailable: ${openPoCountRes.error.message}`);

      const supplierRows = await fetchAllRows<SupplierRow>(async (from, to) => {
        const res = await supabase
          .from("suppliers")
          .select("id, name, account_no, email, phone, is_active, created_at, created_by, notes, shop_id")
          .eq("shop_id", sid)
          .order("name", { ascending: true })
          .range(from, to);
        if (res.error) {
          warnings.push(`Vendor directory load error: ${res.error.message}`);
          return [];
        }
        return (res.data ?? []) as SupplierRow[];
      });

      const partsRows = await fetchAllRows<Pick<PartRow, "id" | "shop_id" | "supplier" | "part_number" | "sku" | "name">>(async (from, to) => {
        const res = await supabase
          .from("parts")
          .select("id, shop_id, supplier, part_number, sku, name")
          .eq("shop_id", sid)
          .order("id", { ascending: true })
          .range(from, to);
        if (res.error) {
          warnings.push(`Parts linkage scan unavailable: ${res.error.message}`);
          return [];
        }
        return (res.data ?? []) as Array<Pick<PartRow, "id" | "shop_id" | "supplier" | "part_number" | "sku" | "name">>;
      });

      const poRows = await fetchAllRows<Pick<PurchaseOrderRow, "id" | "supplier_id" | "status" | "created_at">>(async (from, to) => {
        const res = await supabase
          .from("purchase_orders")
          .select("id, supplier_id, status, created_at")
          .eq("shop_id", sid)
          .order("created_at", { ascending: false })
          .range(from, to);
        if (res.error) {
          warnings.push(`PO data load unavailable: ${res.error.message}`);
          return [];
        }
        return (res.data ?? []) as Array<Pick<PurchaseOrderRow, "id" | "supplier_id" | "status" | "created_at">>;
      });

      const poLineRows = await fetchAllRows<Pick<PurchaseOrderLineRow, "id" | "po_id" | "part_id" | "created_at">>(async (from, to) => {
        const res = await supabase
          .from("purchase_order_lines")
          .select("id, po_id, part_id, created_at")
          .order("created_at", { ascending: false })
          .range(from, to);
        if (res.error) {
          warnings.push(`PO line linkage scan unavailable: ${res.error.message}`);
          return [];
        }
        return (res.data ?? []) as Array<Pick<PurchaseOrderLineRow, "id" | "po_id" | "part_id" | "created_at">>;
      });

      const barcodeLinks = await fetchAllRows<{ supplier_id: string | null; part_id: string | null }>(async (from, to) => {
        const res = await supabase
          .from("parts_barcodes")
          .select("supplier_id, part_id")
          .eq("shop_id", sid)
          .range(from, to);
        if (res.error) {
          warnings.push(`Parts barcode linkage scan unavailable: ${res.error.message}`);
          return [];
        }
        return (res.data ?? []) as Array<{ supplier_id: string | null; part_id: string | null }>;
      });

      const partRequestRows = await fetchAllRows<Pick<PartRequestItemRow, "id" | "po_id" | "qty_approved" | "qty_received" | "vendor" | "vendor_id">>(async (from, to) => {
        const res = await supabase
          .from("part_request_items")
          .select("id, po_id, qty_approved, qty_received, vendor, vendor_id")
          .eq("shop_id", sid)
          .order("created_at", { ascending: false })
          .range(from, to);
        if (res.error) {
          warnings.push(`Receiving queue scan unavailable: ${res.error.message}`);
          return [];
        }
        return (res.data ?? []) as Array<Pick<PartRequestItemRow, "id" | "po_id" | "qty_approved" | "qty_received" | "vendor" | "vendor_id">>;
      });

      const supplierById = new Map<string, SupplierRow>();
      supplierRows.forEach((row) => supplierById.set(String(row.id), row));

      const poById = new Map<string, Pick<PurchaseOrderRow, "id" | "supplier_id" | "status" | "created_at">>();
      poRows.forEach((row) => poById.set(String(row.id), row));

      const partIdsBySupplier = new Map<string, Set<string>>();
      const openPoCountBySupplier = new Map<string, number>();
      const pendingReceivingBySupplier = new Map<string, number>();
      const lastActivityBySupplier = new Map<string, string>();
      const linkedPartIdsAll = new Set<string>();

      for (const row of poRows) {
        const supplierId = String(row.supplier_id ?? "");
        if (!supplierId) continue;

        if (OPEN_PO_STATUSES.includes(String(row.status ?? "").toLowerCase())) {
          openPoCountBySupplier.set(supplierId, (openPoCountBySupplier.get(supplierId) ?? 0) + 1);
        }

        const ts = row.created_at ?? null;
        if (ts) {
          const prev = lastActivityBySupplier.get(supplierId);
          if (!prev || new Date(ts).getTime() > new Date(prev).getTime()) {
            lastActivityBySupplier.set(supplierId, ts);
          }
        }
      }

      for (const row of poLineRows) {
        const po = poById.get(String(row.po_id));
        const supplierId = String(po?.supplier_id ?? "");
        const partId = String(row.part_id ?? "");
        if (!supplierId || !partId) continue;

        const existing = partIdsBySupplier.get(supplierId) ?? new Set<string>();
        existing.add(partId);
        partIdsBySupplier.set(supplierId, existing);
        linkedPartIdsAll.add(partId);
      }

      for (const row of barcodeLinks) {
        const supplierId = String(row.supplier_id ?? "");
        const partId = String(row.part_id ?? "");
        if (!supplierId || !partId) continue;

        const existing = partIdsBySupplier.get(supplierId) ?? new Set<string>();
        existing.add(partId);
        partIdsBySupplier.set(supplierId, existing);
        linkedPartIdsAll.add(partId);
      }

      for (const row of partRequestRows) {
        const approved = Number(row.qty_approved ?? 0);
        const received = Number(row.qty_received ?? 0);
        if (!(approved > received)) continue;

        const po = row.po_id ? poById.get(String(row.po_id)) : null;
        const supplierId = String(po?.supplier_id ?? "");
        if (!supplierId) continue;

        pendingReceivingBySupplier.set(supplierId, (pendingReceivingBySupplier.get(supplierId) ?? 0) + 1);
      }

      const duplicateBuckets = new Map<string, SupplierRow[]>();
      for (const v of supplierRows) {
        const key = norm(v.name);
        if (!key) continue;
        const bucket = duplicateBuckets.get(key) ?? [];
        bucket.push(v);
        duplicateBuckets.set(key, bucket);
      }

      const duplicateCandidateCount = Array.from(duplicateBuckets.values()).reduce((sum, bucket) => {
        if (bucket.length < 2) return sum;
        return sum + bucket.length;
      }, 0);

      const vendorsMissingContact = supplierRows.filter((v) => !hasValue(v.email) && !hasValue(v.phone)).length;
      const vendorsMissingAccount = supplierRows.filter((v) => !hasValue(v.account_no)).length;

      const partsMissingVendorLink = partsRows.filter((p) => {
        const hasSupplierText = hasValue(p.supplier);
        const hasCanonicalLink = linkedPartIdsAll.has(String(p.id));
        return !hasSupplierText && !hasCanonicalLink;
      }).length;

      const partsWithSupplierTextNoCanonicalLink = partsRows.filter((p) => hasValue(p.supplier) && !linkedPartIdsAll.has(String(p.id))).length;

      const poItemsWithVendorTextNoVendorLink = partRequestRows.filter((r) => hasValue(r.vendor) && !hasValue(r.vendor_id)).length;

      const openPoWithoutVendorRecord = poRows.filter((po) => {
        const isOpen = OPEN_PO_STATUSES.includes(String(po.status ?? "").toLowerCase());
        if (!isOpen) return false;
        return !supplierById.has(String(po.supplier_id ?? ""));
      }).length;

      const directoryRows: VendorDirectoryItem[] = supplierRows.map((supplier) => {
        const sidRow = String(supplier.id);
        const linkedPartsCount = (partIdsBySupplier.get(sidRow) ?? new Set<string>()).size;
        const openPoCount = openPoCountBySupplier.get(sidRow) ?? 0;
        const pendingReceivingCount = pendingReceivingBySupplier.get(sidRow) ?? 0;
        const issues: string[] = [];

        if (!hasValue(supplier.email) && !hasValue(supplier.phone)) issues.push("Missing contact email/phone");
        if (!hasValue(supplier.account_no)) issues.push("Missing account number/vendor code");
        if (linkedPartsCount === 0) issues.push("No linked parts detected");

        const dupeBucket = duplicateBuckets.get(norm(supplier.name)) ?? [];
        if (dupeBucket.length > 1) issues.push("Possible duplicate vendor name");

        const row: VendorDirectoryItem = {
          supplier,
          linkedPartsCount,
          openPoCount,
          pendingReceivingCount,
          lastActivityAt: lastActivityBySupplier.get(sidRow) ?? null,
          readiness: "Needs review",
          issues,
        };
        row.readiness = readinessForVendor(row);
        return row;
      });

      const vendorsWithLinkedParts = directoryRows.filter((d) => d.linkedPartsCount > 0).length;

      const withContact = supplierRows.filter((v) => hasValue(v.email) || hasValue(v.phone)).length;
      const withAccount = supplierRows.filter((v) => hasValue(v.account_no)).length;
      const poLinkedCoverage = poRows.length === 0 ? 1 : (poRows.length - openPoWithoutVendorRecord) / poRows.length;
      const partsLinkedCoverage = partsRows.length === 0 ? 1 : (partsRows.length - partsMissingVendorLink) / partsRows.length;

      const partsTech =
        supplierRows.length > 0 && withContact > 0 && withAccount > 0 && partsLinkedCoverage >= 0.4
          ? "Baseline vendor + part linkage exists for preparation."
          : "Needs more complete vendor account/contact data and part linkage before activation prep.";

      const quickBooks =
        supplierRows.length > 0 && withAccount > 0 && withContact > 0
          ? "Vendor master has core fields for export preparation."
          : "Missing vendor account/contact completeness for sync preparation.";

      const supplierApi =
        supplierRows.length > 0 && poLinkedCoverage >= 0.8
          ? "PO linkage is mostly connected for API prep planning."
          : "PO linkage gaps remain (some records are not deterministically linked to vendor records).";

      setVendors(supplierRows);
      setDirectory(directoryRows);
      setDerived({
        totalVendors: vendorCountRes.count ?? supplierRows.length,
        vendorsWithLinkedParts,
        vendorsMissingContact,
        vendorsMissingAccount,
        vendorsMissingContactOrAccount: supplierRows.filter((v) => !hasValue(v.account_no) || (!hasValue(v.email) && !hasValue(v.phone))).length,
        partsMissingVendorLink,
        openPurchaseOrders: openPoCountRes.count ?? null,
        pendingReceivingQueue: partRequestRows.filter((r) => Number(r.qty_approved ?? 0) > Number(r.qty_received ?? 0)).length,
        duplicateVendorCandidates: duplicateCandidateCount,
        partsWithSupplierTextNoCanonicalLink,
        poItemsWithVendorTextNoVendorLink,
        openPoWithoutVendorRecord,
        integrationReadiness: {
          partsTech,
          quickBooks,
          supplierApi,
        },
        warnings,
      });

      setLoading(false);
    })();
  }, [supabase]);

  const filteredDirectory = useMemo(() => {
    const q = search.trim().toLowerCase();

    return directory.filter((row) => {
      if (readinessFilter !== "all" && row.readiness !== readinessFilter) return false;
      if (!q) return true;

      const hay = [
        row.supplier.name,
        row.supplier.account_no,
        row.supplier.email,
        row.supplier.phone,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");

      return hay.includes(q);
    });
  }, [directory, readinessFilter, search]);

  return (
    <div className="relative p-5 text-white fade-in md:p-6">
      <PageShell
        eyebrow="Parts · Vendor operations"
        title="Vendor Command Center"
        description="Manage supplier readiness, linked parts, purchase activity, and integration preparation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/parts" className={ui.buttonSecondary}>Parts Dashboard</Link>
            <Link href="/parts/inventory" className={ui.buttonSecondary}>Inventory</Link>
            <Link href="/parts/po" className={ui.buttonSecondary}>Purchase Orders</Link>
            <Link href="/parts/receiving" className={ui.buttonSecondary}>Receiving Inbox</Link>
            <Link href="/parts/requests" className={ui.buttonSecondary}>Parts Requests</Link>
            <Link href="/parts/receive" className={ui.buttonSecondary}>Scan to Receive</Link>
          </div>
        }
      >
        <div className="space-y-4">
          {error ? <div className="desktop-panel-soft border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard title="Total vendors" value={loading ? "…" : formatCount(derived.totalVendors)} />
            <KpiCard title="Vendors with linked parts" value={loading ? "…" : formatCount(derived.vendorsWithLinkedParts)} />
            <KpiCard title="Vendors missing contact/account setup" value={loading ? "…" : formatCount(derived.vendorsMissingContactOrAccount)} hint="Missing either contact info or account number." />
            <KpiCard title="Parts missing vendor link" value={loading ? "…" : formatCount(derived.partsMissingVendorLink)} href="/parts/inventory" />
            <KpiCard title="Open purchase orders" value={loading ? "…" : formatCount(derived.openPurchaseOrders)} href="/parts/po" />
            <KpiCard title="Pending receiving / queue" value={loading ? "…" : formatCount(derived.pendingReceivingQueue)} href="/parts/receiving" />
            <KpiCard title="Duplicate vendor candidates" value={loading ? "…" : formatCount(derived.duplicateVendorCandidates)} hint="Normalized exact-name duplicate detection." />
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="desktop-panel-soft p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Vendor readiness / data quality</p>
              <ul className="mt-3 space-y-2 text-sm text-neutral-200">
                <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Vendors missing contact email/phone</span><strong>{loading ? "…" : formatCount(derived.vendorsMissingContact)}</strong></li>
                <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Vendors missing account number/vendor code</span><strong>{loading ? "…" : formatCount(derived.vendorsMissingAccount)}</strong></li>
                <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Vendor records with no linked parts</span><strong>{loading ? "…" : directory.filter((d) => d.linkedPartsCount === 0).length.toLocaleString()}</strong></li>
                <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Parts with vendor text but no canonical vendor link</span><strong>{loading ? "…" : formatCount(derived.partsWithSupplierTextNoCanonicalLink)}</strong></li>
                <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>PO/request rows with vendor text but no vendor link</span><strong>{loading ? "…" : formatCount(derived.poItemsWithVendorTextNoVendorLink)}</strong></li>
                <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Open purchase orders with missing vendor record</span><strong>{loading ? "…" : formatCount(derived.openPoWithoutVendorRecord)}</strong></li>
              </ul>
            </div>

            <div className="desktop-panel-soft p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Integration readiness</p>
              <h2 className="mt-2 text-base font-semibold text-white">Preparation only — live integrations not connected yet.</h2>
              <ul className="mt-3 space-y-2 text-sm text-neutral-200">
                <li className="desktop-item-card px-3 py-2"><span className="font-semibold text-neutral-100">PartsTech readiness:</span> {derived.integrationReadiness.partsTech}</li>
                <li className="desktop-item-card px-3 py-2"><span className="font-semibold text-neutral-100">QuickBooks vendor sync readiness:</span> {derived.integrationReadiness.quickBooks}</li>
                <li className="desktop-item-card px-3 py-2"><span className="font-semibold text-neutral-100">Supplier API readiness:</span> {derived.integrationReadiness.supplierApi}</li>
              </ul>
            </div>
          </section>

          <section className="desktop-panel-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Vendor directory</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Search and triage vendor records</h2>
              </div>
              <div className="flex w-full flex-wrap gap-2 md:w-auto">
                <input
                  className={`${ui.input} min-w-[220px] md:min-w-[280px]`}
                  placeholder="Search by name, account, email, phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select className={ui.input} value={readinessFilter} onChange={(e) => setReadinessFilter(e.target.value)}>
                  <option value="all">All readiness states</option>
                  <option value="Ready">Ready</option>
                  <option value="Missing contact">Missing contact</option>
                  <option value="Missing account/code">Missing account/code</option>
                  <option value="No linked parts">No linked parts</option>
                  <option value="Needs review">Needs review</option>
                </select>
              </div>
            </div>

            {!loading && vendors.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-neutral-700 bg-black/20 p-4 text-sm text-neutral-300">
                <p className="font-medium text-neutral-100">No vendors found yet.</p>
                <p className="mt-1 text-neutral-400">Vendors can appear from Parts inventory usage, purchase orders, receiving flows, or onboarding activation later.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/parts/inventory" className={ui.buttonSecondary}>Go to Inventory</Link>
                  <Link href="/parts/po" className={ui.buttonSecondary}>Go to Purchase Orders</Link>
                </div>
              </div>
            ) : null}

            {!loading && vendors.length > 0 ? (
              <div className="mt-3 space-y-2">
                {filteredDirectory.map((row) => (
                  <details key={row.supplier.id} className="desktop-item-card overflow-hidden">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{row.supplier.name}</p>
                        <p className="text-xs text-neutral-400">
                          Account: {hasValue(row.supplier.account_no) ? row.supplier.account_no : "Not tracked"} · Email: {hasValue(row.supplier.email) ? row.supplier.email : "Not tracked"} · Phone: {hasValue(row.supplier.phone) ? row.supplier.phone : "Not tracked"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-md border px-2 py-1 ${readinessTone(row.readiness)}`}>{row.readiness}</span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Parts: {row.linkedPartsCount}</span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Open POs: {row.openPoCount}</span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Pending receive: {row.pendingReceivingCount}</span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Last activity: {formatDate(row.lastActivityAt)}</span>
                      </div>
                    </summary>

                    <div className="border-t border-white/10 bg-black/20 px-3 py-3 text-sm text-neutral-300">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Overview</p>
                          <ul className="mt-2 space-y-1 text-xs text-neutral-300">
                            <li>Vendor ID: {row.supplier.id}</li>
                            <li>Linked parts (detected): {row.linkedPartsCount}</li>
                            <li>Open purchase orders: {row.openPoCount}</li>
                            <li>Pending receiving records: {row.pendingReceivingCount}</li>
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Detected issues</p>
                          {row.issues.length === 0 ? (
                            <p className="mt-2 text-xs text-emerald-200">No deterministic issues detected.</p>
                          ) : (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-200">
                              {row.issues.map((issue) => <li key={issue}>{issue}</li>)}
                            </ul>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href="/parts/inventory" className={ui.buttonSecondary}>Linked parts in Inventory</Link>
                        <Link href="/parts/po" className={ui.buttonSecondary}>Open POs</Link>
                        <Link href="/parts/receiving" className={ui.buttonSecondary}>Receiving activity</Link>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            ) : null}
          </section>

          <section className="desktop-panel-soft p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">AI assistant preparation</p>
            <h2 className="mt-2 text-base font-semibold text-white">Ready for assistant review · Future AI-assisted cleanup</h2>
            <ul className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Duplicate vendor candidates</span><strong>{loading ? "…" : formatCount(derived.duplicateVendorCandidates)}</strong></li>
              <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Parts missing vendor link</span><strong>{loading ? "…" : formatCount(derived.partsMissingVendorLink)}</strong></li>
              <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Vendors with no linked parts</span><strong>{loading ? "…" : directory.filter((d) => d.linkedPartsCount === 0).length.toLocaleString()}</strong></li>
              <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>Incomplete vendor setup</span><strong>{loading ? "…" : formatCount(derived.vendorsMissingContactOrAccount)}</strong></li>
              <li className="desktop-item-card flex items-center justify-between px-3 py-2"><span>PO/request records that appear unlinked</span><strong>{loading ? "…" : formatCount((derived.openPoWithoutVendorRecord ?? 0) + (derived.poItemsWithVendorTextNoVendorLink ?? 0))}</strong></li>
            </ul>
          </section>

          {derived.warnings.length > 0 ? (
            <section className="desktop-panel-soft border border-amber-500/30 bg-amber-950/25 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300">Data availability notes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
                {derived.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </section>
          ) : null}

          <div className="text-xs text-neutral-500">Shop scope: {shopId || "Not resolved"}</div>
        </div>
      </PageShell>
    </div>
  );
}
