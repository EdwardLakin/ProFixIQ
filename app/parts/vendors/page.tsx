"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, PlugZap } from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";
import {
  buildVendorWorkspace,
  hasVendorValue,
  type VendorDirectoryItem,
  type VendorOperationalState,
  type VendorWorkspaceSummary,
} from "@/features/parts/lib/vendorWorkspace";

type DB = Database;
type SupplierRow = DB["public"]["Tables"]["suppliers"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type PurchaseOrderRow = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderLineRow = DB["public"]["Tables"]["purchase_order_lines"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];

type VendorDraft = {
  name: string;
  accountNo: string;
  email: string;
  phone: string;
  notes: string;
  isActive: boolean;
};

const EMPTY_SUMMARY: VendorWorkspaceSummary = {
  totalVendors: 0,
  vendorsNeedingSetup: 0,
  openPurchaseOrders: 0,
  pendingReceiving: 0,
  catalogLinkedParts: 0,
  legacyUnlinkedParts: 0,
  partsWithoutVendorReference: 0,
  duplicateVendorCandidates: 0,
  openPoWithoutVendorRecord: 0,
  requestRowsWithoutVendorRecord: 0,
};

const EMPTY_DRAFT: VendorDraft = {
  name: "",
  accountNo: "",
  email: "",
  phone: "",
  notes: "",
  isActive: true,
};

const DIRECTORY_STATES: VendorOperationalState[] = [
  "Receiving",
  "On order",
  "Needs setup",
  "Active",
  "No activity",
  "Inactive",
];

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "No purchase activity";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No purchase activity" : date.toLocaleDateString();
}

function stateTone(state: VendorOperationalState): string {
  switch (state) {
    case "Receiving":
      return "border-sky-500/35 bg-sky-500/10 text-sky-200";
    case "On order":
      return "border-violet-500/35 bg-violet-500/10 text-violet-200";
    case "Needs setup":
      return "border-amber-500/35 bg-amber-500/10 text-amber-200";
    case "Active":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
    case "Inactive":
      return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-muted)]";
    default:
      return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]";
  }
}

async function resolveShopContext(
  supabase: ReturnType<typeof createBrowserSupabase>,
): Promise<{ shopId: string; role: string }> {
  const { data: userResult } = await supabase.auth.getUser();
  const userId = userResult.user?.id ?? null;
  if (!userId) return { shopId: "", role: "" };

  const { data: byUserId } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (byUserId?.shop_id) {
    return { shopId: String(byUserId.shop_id), role: String(byUserId.role ?? "") };
  }

  const { data: byId } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", userId)
    .maybeSingle();
  return {
    shopId: String(byId?.shop_id ?? ""),
    role: String(byId?.role ?? ""),
  };
}

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function MetricCard({
  label,
  value,
  detail,
  onClick,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <div className={`${ui.itemCard} h-full px-4 py-3 text-left transition hover:border-[color:var(--desktop-border-strong)]`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[color:var(--theme-text-primary)]">
        {formatCount(value)}
      </p>
      <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{detail}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block min-w-0">
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="min-w-0">
        {content}
      </button>
    );
  }
  return content;
}

function IntegrationCard({
  name,
  status,
  description,
  action,
}: {
  name: string;
  status: "Available now" | "Planned";
  description: string;
  action?: React.ReactNode;
}) {
  const live = status === "Available now";
  return (
    <div className={`${ui.itemCard} flex h-full flex-col justify-between gap-4 p-4`}>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-[color:var(--theme-text-secondary)]" />
            <h3 className="font-semibold text-[color:var(--theme-text-primary)]">{name}</h3>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
              live
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-muted)]"
            }`}
          >
            {status}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          {description}
        </p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function VendorModal({
  open,
  draft,
  editing,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  draft: VendorDraft;
  editing: boolean;
  busy: boolean;
  error: string | null;
  onChange: (draft: VendorDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  const inputClass = `${ui.input} w-full`;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[color:var(--theme-surface-overlay)] p-0 sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vendor-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Vendor record
            </p>
            <h2 id="vendor-form-title" className="mt-1 text-xl font-semibold">
              {editing ? "Edit vendor" : "Add vendor"}
            </h2>
          </div>
          <button type="button" className={ui.buttonSecondary} onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Vendor name
            </span>
            <input
              className={inputClass}
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              autoFocus
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Account number / vendor code
            </span>
            <input
              className={inputClass}
              value={draft.accountNo}
              onChange={(event) => onChange({ ...draft, accountNo: event.target.value })}
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Phone
            </span>
            <input
              className={inputClass}
              value={draft.phone}
              onChange={(event) => onChange({ ...draft, phone: event.target.value })}
              inputMode="tel"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Email
            </span>
            <input
              className={inputClass}
              value={draft.email}
              onChange={(event) => onChange({ ...draft, email: event.target.value })}
              type="email"
              inputMode="email"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Notes
            </span>
            <textarea
              className={`${inputClass} min-h-24 resize-y`}
              value={draft.notes}
              onChange={(event) => onChange({ ...draft, notes: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => onChange({ ...draft, isActive: event.target.checked })}
            />
            Active vendor
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={ui.buttonSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={ui.buttonPrimary} onClick={onSubmit} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add vendor"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PartsVendorsPage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [vendors, setVendors] = useState<SupplierRow[]>([]);
  const [directory, setDirectory] = useState<VendorDirectoryItem[]>([]);
  const [summary, setSummary] = useState<VendorWorkspaceSummary>(EMPTY_SUMMARY);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [refreshToken, setRefreshToken] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<SupplierRow | null>(null);
  const [draft, setDraft] = useState<VendorDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      setWarnings([]);
      const context = await resolveShopContext(supabase);
      if (cancelled) return;
      setRole(context.role.toLowerCase());

      if (!context.shopId) {
        setError("Unable to resolve the current shop.");
        setLoading(false);
        return;
      }

      const loadWarnings: string[] = [];
      const suppliers = await fetchAllRows<SupplierRow>(async (from, to) => {
        const result = await supabase
          .from("suppliers")
          .select("id, name, account_no, email, phone, notes, is_active, created_at, created_by, shop_id")
          .eq("shop_id", context.shopId)
          .order("name", { ascending: true })
          .range(from, to);
        if (result.error) {
          loadWarnings.push(`Vendors: ${result.error.message}`);
          return [];
        }
        return (result.data ?? []) as SupplierRow[];
      });

      const [
        parts,
        purchaseOrders,
        purchaseOrderLines,
        requestItems,
        barcodeLinks,
        vendorPartNumberLinks,
      ] = await Promise.all([
        fetchAllRows<Pick<PartRow, "id" | "supplier" | "part_number" | "sku">>(
          async (from, to) => {
            const result = await supabase
              .from("parts")
              .select("id, supplier, part_number, sku")
              .eq("shop_id", context.shopId)
              .order("id", { ascending: true })
              .range(from, to);
            if (result.error) {
              loadWarnings.push(`Inventory vendor references: ${result.error.message}`);
              return [];
            }
            return result.data ?? [];
          },
        ),
        fetchAllRows<
          Pick<PurchaseOrderRow, "id" | "supplier_id" | "status" | "created_at">
        >(async (from, to) => {
          const result = await supabase
            .from("purchase_orders")
            .select("id, supplier_id, status, created_at")
            .eq("shop_id", context.shopId)
            .order("created_at", { ascending: false })
            .range(from, to);
          if (result.error) {
            loadWarnings.push(`Purchase orders: ${result.error.message}`);
            return [];
          }
          return result.data ?? [];
        }),
        fetchAllRows<Pick<PurchaseOrderLineRow, "po_id" | "part_id">>(
          async (from, to) => {
            const result = await supabase
              .from("purchase_order_lines")
              .select("po_id, part_id")
              .range(from, to);
            if (result.error) {
              loadWarnings.push(`Purchase-order part history: ${result.error.message}`);
              return [];
            }
            return result.data ?? [];
          },
        ),
        fetchAllRows<
          Pick<
            PartRequestItemRow,
            "po_id" | "qty_approved" | "qty_received" | "vendor" | "vendor_id"
          >
        >(async (from, to) => {
          const result = await supabase
            .from("part_request_items")
            .select("po_id, qty_approved, qty_received, vendor, vendor_id")
            .eq("shop_id", context.shopId)
            .range(from, to);
          if (result.error) {
            loadWarnings.push(`Receiving queue: ${result.error.message}`);
            return [];
          }
          return result.data ?? [];
        }),
        fetchAllRows<{ supplier_id: string | null; part_id: string | null }>(
          async (from, to) => {
            const result = await supabase
              .from("parts_barcodes")
              .select("supplier_id, part_id")
              .eq("shop_id", context.shopId)
              .range(from, to);
            if (result.error) {
              loadWarnings.push(`Barcode vendor links: ${result.error.message}`);
              return [];
            }
            return result.data ?? [];
          },
        ),
        fetchAllRows<{ supplier_id: string | null; part_id: string | null }>(
          async (from, to) => {
            const result = await supabase
              .from("vendor_part_numbers")
              .select("supplier_id, part_id")
              .eq("shop_id", context.shopId)
              .range(from, to);
            if (result.error) {
              loadWarnings.push(`Vendor catalog links: ${result.error.message}`);
              return [];
            }
            return result.data ?? [];
          },
        ),
      ]);

      if (cancelled) return;
      const workspace = buildVendorWorkspace({
        suppliers,
        parts,
        purchaseOrders,
        purchaseOrderLines,
        requestItems,
        barcodeLinks,
        vendorPartNumberLinks,
      });
      setVendors(suppliers);
      setDirectory(workspace.directory);
      setSummary(workspace.summary);
      setWarnings(loadWarnings);
      setLoading(false);
    })().catch((loadError: unknown) => {
      if (cancelled) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load vendor workspace.",
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshToken, supabase]);

  const filteredDirectory = useMemo(() => {
    const query = search.trim().toLowerCase();
    return directory.filter((row) => {
      if (
        stateFilter === "needs_setup" &&
        !(
          (!hasVendorValue(row.supplier.email) && !hasVendorValue(row.supplier.phone)) ||
          !hasVendorValue(row.supplier.account_no)
        )
      ) {
        return false;
      }
      if (
        stateFilter === "duplicates" &&
        !row.issues.includes("Possible duplicate vendor record")
      ) {
        return false;
      }
      if (
        stateFilter !== "all" &&
        stateFilter !== "needs_setup" &&
        stateFilter !== "duplicates" &&
        row.state !== stateFilter
      ) {
        return false;
      }
      if (!query) return true;
      return [
        row.supplier.name,
        row.supplier.account_no,
        row.supplier.email,
        row.supplier.phone,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ")
        .includes(query);
    });
  }, [directory, search, stateFilter]);

  const canManageConnections = role === "owner" || role === "admin";

  const openCreate = useCallback(() => {
    setEditingVendor(null);
    setDraft(EMPTY_DRAFT);
    setSaveError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((vendor: SupplierRow) => {
    setEditingVendor(vendor);
    setDraft({
      name: vendor.name,
      accountNo: vendor.account_no ?? "",
      email: vendor.email ?? "",
      phone: vendor.phone ?? "",
      notes: vendor.notes ?? "",
      isActive: vendor.is_active,
    });
    setSaveError(null);
    setModalOpen(true);
  }, []);

  const saveVendor = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/parts/vendors", {
        method: editingVendor ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(editingVendor ? { id: editingVendor.id } : {}),
          ...draft,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Unable to save vendor.");
      }
      setModalOpen(false);
      setEditingVendor(null);
      setDraft(EMPTY_DRAFT);
      setRefreshToken((value) => value + 1);
    } catch (saveFailure) {
      setSaveError(
        saveFailure instanceof Error ? saveFailure.message : "Unable to save vendor.",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, editingVendor]);

  return (
    <div className="relative p-4 text-[color:var(--theme-text-primary)] fade-in sm:p-5 md:p-6">
      <PageShell
        eyebrow="Parts · Purchasing"
        title="Vendors"
        description="Manage the supplier records used by parts requests, purchase orders, receiving, and vendor catalog matching."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.buttonPrimary} onClick={openCreate}>
              <Plus className="mr-1.5 inline h-4 w-4" />
              Add vendor
            </button>
            <Link href="/parts/po" className={ui.buttonSecondary}>
              Purchase orders
            </Link>
            <Link href="/parts/receiving" className={ui.buttonSecondary}>
              Receiving
            </Link>
          </div>
        }
      >
        <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <section aria-labelledby="vendor-overview-title">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                  Operational overview
                </p>
                <h2 id="vendor-overview-title" className="mt-1 text-lg font-semibold">
                  What needs attention now
                </h2>
              </div>
              {loading ? (
                <span className="text-xs text-[color:var(--theme-text-muted)]">Loading…</span>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Vendors"
                value={summary.totalVendors}
                detail="Active and inactive supplier records"
                onClick={() => setStateFilter("all")}
              />
              <MetricCard
                label="Need setup"
                value={summary.vendorsNeedingSetup}
                detail="Missing contact or account information"
                onClick={() => setStateFilter("needs_setup")}
              />
              <MetricCard
                label="Open purchase orders"
                value={summary.openPurchaseOrders}
                detail="Orders still in progress"
                href="/parts/po"
              />
              <MetricCard
                label="Pending receiving"
                value={summary.pendingReceiving}
                detail="Approved quantity not fully received"
                href="/parts/receiving"
              />
              <MetricCard
                label="Catalog-linked parts"
                value={summary.catalogLinkedParts}
                detail="Direct vendor part-number or barcode links"
              />
              <MetricCard
                label="Legacy vendor text"
                value={summary.legacyUnlinkedParts}
                detail="Inventory names not yet converted to catalog links"
                href="/parts/inventory"
              />
            </div>
          </section>

          {(summary.duplicateVendorCandidates > 0 ||
            summary.openPoWithoutVendorRecord > 0 ||
            summary.requestRowsWithoutVendorRecord > 0 ||
            summary.partsWithoutVendorReference > 0) &&
          !loading ? (
            <section className="desktop-panel-soft p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Data cleanup
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {summary.duplicateVendorCandidates > 0 ? (
                  <button
                    type="button"
                    className={`${ui.itemCard} flex items-center justify-between gap-3 px-3 py-3 text-left`}
                    onClick={() => {
                      setSearch("");
                      setStateFilter("duplicates");
                    }}
                  >
                    <span>Possible duplicate vendor records</span>
                    <strong>{formatCount(summary.duplicateVendorCandidates)}</strong>
                  </button>
                ) : null}
                {summary.partsWithoutVendorReference > 0 ? (
                  <Link
                    href="/parts/inventory"
                    className={`${ui.itemCard} flex items-center justify-between gap-3 px-3 py-3`}
                  >
                    <span>Inventory parts with no vendor reference</span>
                    <strong>{formatCount(summary.partsWithoutVendorReference)}</strong>
                  </Link>
                ) : null}
                {summary.openPoWithoutVendorRecord > 0 ? (
                  <Link
                    href="/parts/po"
                    className={`${ui.itemCard} flex items-center justify-between gap-3 px-3 py-3`}
                  >
                    <span>Open POs missing a valid vendor</span>
                    <strong>{formatCount(summary.openPoWithoutVendorRecord)}</strong>
                  </Link>
                ) : null}
                {summary.requestRowsWithoutVendorRecord > 0 ? (
                  <Link
                    href="/parts/requests"
                    className={`${ui.itemCard} flex items-center justify-between gap-3 px-3 py-3`}
                  >
                    <span>Part requests using vendor text only</span>
                    <strong>{formatCount(summary.requestRowsWithoutVendorRecord)}</strong>
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="desktop-panel-soft p-4" aria-labelledby="integrations-title">
            <div className="max-w-3xl">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Connected services
              </p>
              <h2 id="integrations-title" className="mt-1 text-lg font-semibold">
                Integration status
              </h2>
              <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
                Only QuickBooks is implemented today. Supplier catalog lookup and automatic
                ordering are planned; no supplier credentials or live ordering are active.
              </p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <IntegrationCard
                name="QuickBooks Online"
                status="Available now"
                description="Connect one company per shop and export finalized ProFixIQ invoices. It does not currently import vendors, inventory, or purchase orders."
                action={
                  canManageConnections ? (
                    <Link
                      href="/dashboard/owner/settings/integrations/quickbooks"
                      className={ui.buttonSecondary}
                    >
                      Manage QuickBooks
                    </Link>
                  ) : (
                    <p className="text-xs text-[color:var(--theme-text-muted)]">
                      An owner or admin manages this connection.
                    </p>
                  )
                }
              />
              <IntegrationCard
                name="PartsTech"
                status="Planned"
                description="Future catalog search, availability, and ordering. The current parts workflow remains manual and fully usable."
              />
              <IntegrationCard
                name="Direct supplier ordering"
                status="Planned"
                description="Future supplier-specific API connections for quotes and orders. No live supplier API calls are made today."
              />
            </div>
          </section>

          <section className="desktop-panel-soft p-4" aria-labelledby="directory-title">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                  Vendor directory
                </p>
                <h2 id="directory-title" className="mt-1 text-lg font-semibold">
                  Supplier records and activity
                </h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                  Expand a vendor to review its setup, catalog links, purchase history, and receiving work.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto">
                <input
                  className={`${ui.input} min-w-0 lg:min-w-[280px]`}
                  placeholder="Search vendors"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <select
                  className={ui.input}
                  value={stateFilter}
                  onChange={(event) => setStateFilter(event.target.value)}
                >
                  <option value="all">All vendor states</option>
                  <option value="needs_setup">Needs setup</option>
                  <option value="duplicates">Possible duplicates</option>
                  {DIRECTORY_STATES.filter((state) => state !== "Needs setup").map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!loading && vendors.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 text-sm">
                <p className="font-medium">No vendors yet.</p>
                <p className="mt-1 text-[color:var(--theme-text-secondary)]">
                  Add the shops your parts department buys from. Those records become the
                  supplier source for purchase orders and receiving.
                </p>
                <button type="button" className={`${ui.buttonPrimary} mt-3`} onClick={openCreate}>
                  Add first vendor
                </button>
              </div>
            ) : null}

            {!loading && vendors.length > 0 && filteredDirectory.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
                No vendors match this search and filter.
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {filteredDirectory.map((row) => (
                <details key={row.supplier.id} className="desktop-item-card overflow-hidden">
                  <summary className="cursor-pointer list-none px-3 py-3 sm:px-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-[color:var(--theme-text-primary)]">
                            {row.supplier.name}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateTone(row.state)}`}
                          >
                            {row.state}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                          Account: {hasVendorValue(row.supplier.account_no) ? row.supplier.account_no : "Not set"}
                          <span className="mx-1.5 text-[color:var(--theme-text-muted)]">·</span>
                          {hasVendorValue(row.supplier.email) ? row.supplier.email : "No email"}
                          <span className="mx-1.5 text-[color:var(--theme-text-muted)]">·</span>
                          {hasVendorValue(row.supplier.phone) ? row.supplier.phone : "No phone"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap">
                        <span className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1.5">
                          Catalog parts: {row.catalogPartCount}
                        </span>
                        <span className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1.5">
                          Open POs: {row.openPoCount}
                        </span>
                        <span className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1.5">
                          To receive: {row.pendingReceivingCount}
                        </span>
                        <span className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1.5">
                          Last PO: {formatDate(row.lastActivityAt)}
                        </span>
                      </div>
                    </div>
                  </summary>

                  <div className="border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 sm:p-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                          Activity
                        </p>
                        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div className={`${ui.itemCard} px-3 py-2`}>
                            <dt className="text-xs text-[color:var(--theme-text-muted)]">Catalog links</dt>
                            <dd className="mt-1 font-semibold">{row.catalogPartCount}</dd>
                          </div>
                          <div className={`${ui.itemCard} px-3 py-2`}>
                            <dt className="text-xs text-[color:var(--theme-text-muted)]">Parts bought before</dt>
                            <dd className="mt-1 font-semibold">{row.purchasedPartCount}</dd>
                          </div>
                          <div className={`${ui.itemCard} px-3 py-2`}>
                            <dt className="text-xs text-[color:var(--theme-text-muted)]">Open POs</dt>
                            <dd className="mt-1 font-semibold">{row.openPoCount}</dd>
                          </div>
                          <div className={`${ui.itemCard} px-3 py-2`}>
                            <dt className="text-xs text-[color:var(--theme-text-muted)]">Pending receiving</dt>
                            <dd className="mt-1 font-semibold">{row.pendingReceivingCount}</dd>
                          </div>
                        </dl>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                          Setup review
                        </p>
                        {row.issues.length > 0 ? (
                          <ul className="mt-2 space-y-2 text-sm">
                            {row.issues.map((issue) => (
                              <li
                                key={issue}
                                className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-100"
                              >
                                {issue}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                            Vendor setup is complete.
                          </p>
                        )}
                      </div>
                    </div>
                    {row.supplier.notes ? (
                      <div className="mt-4 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm text-[color:var(--theme-text-secondary)]">
                        <span className="font-medium text-[color:var(--theme-text-primary)]">Notes:</span>{" "}
                        {row.supplier.notes}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={ui.buttonSecondary}
                        onClick={() => openEdit(row.supplier as SupplierRow)}
                      >
                        <Pencil className="mr-1.5 inline h-3.5 w-3.5" />
                        Edit vendor
                      </button>
                      <Link href="/parts/po" className={ui.buttonSecondary}>
                        Purchase orders
                      </Link>
                      <Link href="/parts/inventory" className={ui.buttonSecondary}>
                        Inventory
                      </Link>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>

          {warnings.length > 0 ? (
            <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                Some vendor data could not be loaded
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </PageShell>

      <VendorModal
        open={modalOpen}
        draft={draft}
        editing={Boolean(editingVendor)}
        busy={saving}
        error={saveError}
        onChange={setDraft}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        onSubmit={() => void saveVendor()}
      />
    </div>
  );
}
