"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Mail,
  PackageCheck,
  Pencil,
  Phone,
  PlugZap,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";
import {
  buildVendorWorkspace,
  type VendorDirectoryItem,
  type VendorOperationalState,
  type VendorWorkspaceSummary,
} from "@/features/parts/lib/vendorWorkspace";

type DB = Database;
type SupplierRow = DB["public"]["Tables"]["suppliers"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type PurchaseOrderRow = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderLineRow =
  DB["public"]["Tables"]["purchase_order_lines"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];

type VendorDraft = {
  name: string;
  accountNo: string;
  email: string;
  phone: string;
  notes: string;
  isActive: boolean;
};

type DirectoryFilter =
  | "all"
  | "attention"
  | "receiving"
  | "on_order"
  | "inactive"
  | "duplicates";

type PanelMode = "profile" | "edit" | "create" | null;

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

const STATE_PRIORITY: Record<VendorOperationalState, number> = {
  Receiving: 0,
  "On order": 1,
  "Needs setup": 2,
  Active: 3,
  "No activity": 4,
  Inactive: 5,
};

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "No orders yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No orders yet"
    : date.toLocaleDateString();
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
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

function matchesFilter(
  row: VendorDirectoryItem,
  filter: DirectoryFilter,
): boolean {
  switch (filter) {
    case "attention":
      return row.issues.length > 0;
    case "receiving":
      return row.pendingReceivingCount > 0;
    case "on_order":
      return row.openPoCount > 0;
    case "inactive":
      return !row.supplier.is_active;
    case "duplicates":
      return row.setup.possibleDuplicate;
    default:
      return true;
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
    return {
      shopId: String(byUserId.shop_id),
      role: String(byUserId.role ?? ""),
    };
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

function SummaryStrip({
  summary,
  onFilter,
}: {
  summary: VendorWorkspaceSummary;
  onFilter: (filter: DirectoryFilter) => void;
}) {
  const stats = [
    {
      label: "Vendors",
      value: summary.totalVendors,
      detail: "supplier records",
      action: () => onFilter("all"),
    },
    {
      label: "Open POs",
      value: summary.openPurchaseOrders,
      detail: "orders in progress",
      href: "/parts/po",
    },
    {
      label: "To receive",
      value: summary.pendingReceiving,
      detail: "approved line items",
      href: "/parts/receiving",
    },
    {
      label: "Catalog linked",
      value: summary.catalogLinkedParts,
      detail: "inventory parts",
    },
  ];

  return (
    <section
      className="grid overflow-hidden rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg)] sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Vendor activity summary"
    >
      {stats.map((stat, index) => {
        const content = (
          <div
            className={`flex min-h-24 items-center gap-3 px-4 py-3 text-left transition hover:bg-[color:var(--theme-surface-subtle)] ${
              index > 0
                ? "border-t border-[color:var(--theme-border-soft)] sm:border-l"
                : ""
            } ${index === 1 ? "sm:border-t-0" : ""} ${
              index === 2
                ? "sm:border-l-0 sm:border-t xl:border-l xl:border-t-0"
                : ""
            } ${index === 3 ? "sm:border-t xl:border-t-0" : ""}`}
          >
            <span className="text-3xl font-semibold tabular-nums text-[color:var(--theme-text-primary)]">
              {formatCount(stat.value)}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[color:var(--theme-text-primary)]">
                {stat.label}
              </span>
              <span className="block text-xs text-[color:var(--theme-text-muted)]">
                {stat.detail}
              </span>
            </span>
          </div>
        );

        if (stat.href) {
          return (
            <Link key={stat.label} href={stat.href}>
              {content}
            </Link>
          );
        }
        if (stat.action) {
          return (
            <button key={stat.label} type="button" onClick={stat.action}>
              {content}
            </button>
          );
        }
        return <div key={stat.label}>{content}</div>;
      })}
    </section>
  );
}

function AttentionQueue({
  summary,
  loading,
  onFilter,
}: {
  summary: VendorWorkspaceSummary;
  loading: boolean;
  onFilter: (filter: DirectoryFilter) => void;
}) {
  const actions = [
    {
      key: "setup",
      count: summary.vendorsNeedingSetup,
      label: "Vendor profiles need setup",
      detail: "Add account or contact details",
      action: () => onFilter("attention"),
    },
    {
      key: "duplicates",
      count: summary.duplicateVendorCandidates,
      label: "Possible duplicate vendors",
      detail: "Review matching supplier names",
      action: () => onFilter("duplicates"),
    },
    {
      key: "legacy",
      count: summary.legacyUnlinkedParts,
      label: "Legacy vendor references",
      detail: "Convert text into catalog links",
      href: "/parts/inventory",
    },
    {
      key: "missing-po",
      count: summary.openPoWithoutVendorRecord,
      label: "Open POs missing a vendor",
      detail: "Repair the purchasing link",
      href: "/parts/po",
    },
    {
      key: "requests",
      count: summary.requestRowsWithoutVendorRecord,
      label: "Requests using vendor text",
      detail: "Connect them to a vendor record",
      href: "/parts/requests",
    },
    {
      key: "inventory",
      count: summary.partsWithoutVendorReference,
      label: "Parts without a vendor",
      detail: "Add a vendor source",
      href: "/parts/inventory",
    },
  ].filter((item) => item.count > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            Work queue
          </p>
          <h2 className="mt-0.5 text-base font-semibold">Needs attention</h2>
        </div>
        {loading ? (
          <span className="text-xs text-[color:var(--theme-text-muted)]">
            Loading…
          </span>
        ) : actions.length > 0 ? (
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
            {formatCount(
              actions.reduce((total, item) => total + item.count, 0),
            )}{" "}
            items
          </span>
        ) : null}
      </div>

      {!loading && actions.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <p className="font-medium text-[color:var(--theme-text-primary)]">
              Vendor records are in good shape
            </p>
            <p className="text-xs text-[color:var(--theme-text-muted)]">
              There are no vendor-link or profile exceptions to review.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--theme-border-soft)]">
          {actions.map((item) => {
            const content = (
              <div className="flex min-h-16 items-center gap-3 px-4 py-3 text-left transition hover:bg-[color:var(--theme-surface-subtle)]">
                <span className="flex h-9 min-w-9 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 px-2 text-sm font-semibold tabular-nums text-amber-100">
                  {formatCount(item.count)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[color:var(--theme-text-primary)]">
                    {item.label}
                  </span>
                  <span className="block text-xs text-[color:var(--theme-text-muted)]">
                    {item.detail}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)]" />
              </div>
            );

            if (item.href) {
              return (
                <Link key={item.key} href={item.href}>
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                className="block w-full"
                onClick={item.action}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function VendorDirectoryRow({
  row,
  selected,
  onSelect,
}: {
  row: VendorDirectoryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const contact =
    row.supplier.email ?? row.supplier.phone ?? "No contact information";
  const orderText =
    row.pendingReceivingCount > 0
      ? `${row.pendingReceivingCount} to receive`
      : row.openPoCount > 0
        ? `${row.openPoCount} open ${row.openPoCount === 1 ? "PO" : "POs"}`
        : "No open orders";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group grid w-full gap-3 border-t border-[color:var(--theme-border-soft)] px-4 py-4 text-left transition first:border-t-0 hover:bg-[color:var(--theme-surface-subtle)] md:grid-cols-[minmax(180px,1.4fr)_minmax(160px,1fr)_150px_120px_20px] md:items-center ${
        selected
          ? "bg-[color:var(--theme-surface-subtle)] shadow-[inset_3px_0_0_var(--accent-copper)]"
          : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-xs font-bold tracking-[0.08em] text-[color:var(--theme-text-secondary)]">
          {getInitials(row.supplier.name) || "V"}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[color:var(--theme-text-primary)]">
            {row.supplier.name}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateTone(row.state)}`}
            >
              {row.state}
            </span>
            {row.issues.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-200">
                <AlertTriangle className="h-3 w-3" />
                {row.issues.length} {row.issues.length === 1 ? "item" : "items"}
              </span>
            ) : null}
          </span>
        </span>
      </div>

      <div className="min-w-0 pl-[52px] md:pl-0">
        <span className="block truncate text-sm text-[color:var(--theme-text-secondary)]">
          {contact}
        </span>
        <span className="block truncate text-xs text-[color:var(--theme-text-muted)]">
          {row.supplier.account_no
            ? `Account ${row.supplier.account_no}`
            : "No account number"}
        </span>
      </div>

      <div className="flex items-center justify-between pl-[52px] md:block md:pl-0">
        <span className="text-xs text-[color:var(--theme-text-muted)] md:hidden">
          Purchasing
        </span>
        <span className="text-sm font-medium text-[color:var(--theme-text-primary)]">
          {orderText}
        </span>
      </div>

      <div className="flex items-center justify-between pl-[52px] md:block md:pl-0">
        <span className="text-xs text-[color:var(--theme-text-muted)] md:hidden">
          Catalog
        </span>
        <span className="text-sm font-medium tabular-nums text-[color:var(--theme-text-primary)]">
          {row.catalogPartCount} linked
        </span>
      </div>

      <ChevronRight className="hidden h-4 w-4 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 md:block" />
    </button>
  );
}

function VendorForm({
  draft,
  busy,
  error,
  submitLabel,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: VendorDraft;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onChange: (draft: VendorDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const inputClass = `${ui.input} w-full`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
            Vendor name
          </span>
          <input
            className={inputClass}
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
            Account number / vendor code
          </span>
          <input
            className={inputClass}
            value={draft.accountNo}
            onChange={(event) =>
              onChange({ ...draft, accountNo: event.target.value })
            }
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Phone
            </span>
            <input
              className={inputClass}
              value={draft.phone}
              onChange={(event) =>
                onChange({ ...draft, phone: event.target.value })
              }
              inputMode="tel"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Email
            </span>
            <input
              className={inputClass}
              value={draft.email}
              onChange={(event) =>
                onChange({ ...draft, email: event.target.value })
              }
              type="email"
              inputMode="email"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
            Internal notes
          </span>
          <textarea
            className={`${inputClass} min-h-28 resize-y`}
            value={draft.notes}
            onChange={(event) =>
              onChange({ ...draft, notes: event.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3 text-sm">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) =>
              onChange({ ...draft, isActive: event.target.checked })
            }
          />
          <span>
            <span className="block font-medium">Active vendor</span>
            <span className="block text-xs text-[color:var(--theme-text-muted)]">
              Available for current purchasing work
            </span>
          </span>
        </label>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--theme-border-soft)] px-5 py-4 sm:flex-row sm:justify-end lg:flex-col-reverse">
        <button
          type="button"
          className={ui.buttonSecondary}
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className={ui.buttonPrimary}
          onClick={onSubmit}
          disabled={busy || !draft.name.trim()}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

function VendorProfile({
  row,
  onEdit,
  onShowDuplicates,
}: {
  row: VendorDirectoryItem;
  onEdit: () => void;
  onShowDuplicates: () => void;
}) {
  const setupComplete = row.issues.length === 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-[color:var(--theme-border-soft)] px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-sm font-bold tracking-[0.08em]">
            {getInitials(row.supplier.name) || "V"}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-xl font-semibold">
              {row.supplier.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${stateTone(row.state)}`}
              >
                {row.state}
              </span>
              <span className="text-xs text-[color:var(--theme-text-muted)]">
                Last PO: {formatDate(row.lastActivityAt)}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className={`${ui.buttonPrimary} mt-4 w-full`}
          onClick={onEdit}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit vendor profile
        </button>
      </div>

      <div className="space-y-5 px-5 py-5">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
            Contact & account
          </p>
          <div className="mt-2 overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)]">
            {row.supplier.account_no ? (
              <div className="flex items-center gap-3 border-b border-[color:var(--theme-border-soft)] px-3 py-3">
                <Building2 className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)]" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                    Account
                  </p>
                  <p className="break-words text-sm font-medium">
                    {row.supplier.account_no}
                  </p>
                </div>
              </div>
            ) : null}
            {row.supplier.phone ? (
              <a
                href={`tel:${row.supplier.phone}`}
                className="flex items-center gap-3 border-b border-[color:var(--theme-border-soft)] px-3 py-3 transition hover:bg-[color:var(--theme-surface-subtle)]"
              >
                <Phone className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)]" />
                <span className="break-all text-sm">{row.supplier.phone}</span>
              </a>
            ) : null}
            {row.supplier.email ? (
              <a
                href={`mailto:${row.supplier.email}`}
                className="flex items-center gap-3 px-3 py-3 transition hover:bg-[color:var(--theme-surface-subtle)]"
              >
                <Mail className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)]" />
                <span className="break-all text-sm">{row.supplier.email}</span>
              </a>
            ) : null}
            {!row.supplier.account_no &&
            !row.supplier.phone &&
            !row.supplier.email ? (
              <button
                type="button"
                onClick={onEdit}
                className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-amber-100"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Add account and contact details
              </button>
            ) : null}
          </div>
        </section>

        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
            Current activity
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <div className={`${ui.itemCard} p-3`}>
              <dt className="text-xs text-[color:var(--theme-text-muted)]">
                Open POs
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {row.openPoCount}
              </dd>
            </div>
            <div className={`${ui.itemCard} p-3`}>
              <dt className="text-xs text-[color:var(--theme-text-muted)]">
                To receive
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {row.pendingReceivingCount}
              </dd>
            </div>
            <div className={`${ui.itemCard} p-3`}>
              <dt className="text-xs text-[color:var(--theme-text-muted)]">
                Catalog links
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {row.catalogPartCount}
              </dd>
            </div>
            <div className={`${ui.itemCard} p-3`}>
              <dt className="text-xs text-[color:var(--theme-text-muted)]">
                Parts purchased
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {row.purchasedPartCount}
              </dd>
            </div>
          </dl>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link href="/parts/po" className={ui.buttonSecondary}>
              Purchase orders
            </Link>
            <Link href="/parts/receiving" className={ui.buttonSecondary}>
              Receiving
            </Link>
          </div>
        </section>

        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
            Record health
          </p>
          {setupComplete ? (
            <div className="mt-2 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Profile is ready</p>
                <p className="mt-0.5 text-xs text-emerald-100/75">
                  No vendor setup exceptions were found.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {row.setup.missingContact || row.setup.missingAccount ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex w-full items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-left text-sm text-amber-100"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    Complete the missing profile details
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </button>
              ) : null}
              {row.setup.possibleDuplicate ? (
                <button
                  type="button"
                  onClick={onShowDuplicates}
                  className="flex w-full items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-left text-sm text-amber-100"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    Review the matching vendor records
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </button>
              ) : null}
              {row.setup.hasLegacyVendorText ? (
                <Link
                  href="/parts/inventory"
                  className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-sm text-amber-100"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    Link {row.legacyMatchedPartCount} legacy inventory{" "}
                    {row.legacyMatchedPartCount === 1 ? "part" : "parts"}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
              ) : null}
            </div>
          )}
        </section>

        {row.supplier.notes ? (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              Internal notes
            </p>
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
              {row.supplier.notes}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function VendorPanel({
  mode,
  row,
  draft,
  busy,
  error,
  onDraftChange,
  onClose,
  onEdit,
  onCancelForm,
  onSubmit,
  onShowDuplicates,
}: {
  mode: PanelMode;
  row: VendorDirectoryItem | null;
  draft: VendorDraft;
  busy: boolean;
  error: string | null;
  onDraftChange: (draft: VendorDraft) => void;
  onClose: () => void;
  onEdit: () => void;
  onCancelForm: () => void;
  onSubmit: () => void;
  onShowDuplicates: () => void;
}) {
  const mobileOpen = mode !== null;
  const heading =
    mode === "create"
      ? "Add vendor"
      : mode === "edit"
        ? "Edit vendor"
        : "Vendor profile";

  return (
    <div
      className={`inset-0 z-[80] bg-[color:var(--theme-surface-overlay)] ${
        mobileOpen ? "fixed" : "hidden"
      } lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:block lg:self-start lg:bg-transparent`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="ml-auto flex h-full w-full max-w-[480px] flex-col overflow-hidden border-l border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg)] shadow-2xl lg:h-[calc(100vh-8rem)] lg:max-h-[820px] lg:max-w-none lg:rounded-2xl lg:border lg:shadow-[var(--theme-shadow-soft)]"
        role={mobileOpen ? "dialog" : "complementary"}
        aria-label={heading}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
              Vendor workspace
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[color:var(--theme-text-primary)]">
              {heading}
            </p>
          </div>
          {mobileOpen ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[color:var(--theme-border-soft)] p-2 text-[color:var(--theme-text-secondary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
              aria-label="Close vendor panel"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {mode === "create" || mode === "edit" ? (
          <VendorForm
            draft={draft}
            busy={busy}
            error={error}
            submitLabel={mode === "create" ? "Add vendor" : "Save changes"}
            onChange={onDraftChange}
            onCancel={onCancelForm}
            onSubmit={onSubmit}
          />
        ) : row ? (
          <VendorProfile
            row={row}
            onEdit={onEdit}
            onShowDuplicates={onShowDuplicates}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
              <Building2 className="h-6 w-6 text-[color:var(--theme-text-muted)]" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Select a vendor</h2>
            <p className="mt-1 max-w-xs text-sm leading-6 text-[color:var(--theme-text-muted)]">
              Open a vendor to see contact details, purchasing activity, catalog
              links, notes, and setup work in one profile.
            </p>
          </div>
        )}
      </aside>
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
  const [directoryFilter, setDirectoryFilter] =
    useState<DirectoryFilter>("all");
  const [refreshToken, setRefreshToken] = useState(0);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
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
          .select(
            "id, name, account_no, email, phone, notes, is_active, created_at, created_by, shop_id",
          )
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
              loadWarnings.push(
                `Inventory vendor references: ${result.error.message}`,
              );
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
              loadWarnings.push(
                `Purchase-order part history: ${result.error.message}`,
              );
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
              loadWarnings.push(
                `Barcode vendor links: ${result.error.message}`,
              );
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
              loadWarnings.push(
                `Vendor catalog links: ${result.error.message}`,
              );
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

  useEffect(() => {
    if (!panelMode) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setPanelMode(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [panelMode, saving]);

  const filteredDirectory = useMemo(() => {
    const query = search.trim().toLowerCase();
    return directory
      .filter((row) => {
        if (!matchesFilter(row, directoryFilter)) return false;
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
      })
      .sort(
        (left, right) =>
          STATE_PRIORITY[left.state] - STATE_PRIORITY[right.state] ||
          left.supplier.name.localeCompare(right.supplier.name),
      );
  }, [directory, directoryFilter, search]);

  const selectedRow =
    directory.find((row) => row.supplier.id === selectedVendorId) ?? null;
  const canManageConnections = role === "owner" || role === "admin";

  const applyFilter = useCallback((filter: DirectoryFilter) => {
    setSearch("");
    setDirectoryFilter(filter);
  }, []);

  const openCreate = useCallback(() => {
    setSelectedVendorId(null);
    setEditingVendor(null);
    setDraft(EMPTY_DRAFT);
    setSaveError(null);
    setPanelMode("create");
  }, []);

  const openProfile = useCallback((row: VendorDirectoryItem) => {
    setSelectedVendorId(row.supplier.id);
    setEditingVendor(null);
    setSaveError(null);
    setPanelMode("profile");
  }, []);

  const openEdit = useCallback((row: VendorDirectoryItem) => {
    const vendor = row.supplier as SupplierRow;
    setSelectedVendorId(vendor.id);
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
    setPanelMode("edit");
  }, []);

  const cancelForm = useCallback(() => {
    if (editingVendor && selectedVendorId) {
      setPanelMode("profile");
      setSaveError(null);
      return;
    }
    setPanelMode(null);
    setEditingVendor(null);
    setDraft(EMPTY_DRAFT);
    setSaveError(null);
  }, [editingVendor, selectedVendorId]);

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
        vendor?: { id?: string };
      };
      if (!response.ok) {
        throw new Error(result.error || "Unable to save vendor.");
      }
      const savedId = result.vendor?.id ?? editingVendor?.id ?? null;
      setSelectedVendorId(savedId);
      setEditingVendor(null);
      setDraft(EMPTY_DRAFT);
      setPanelMode(savedId ? "profile" : null);
      setRefreshToken((value) => value + 1);
    } catch (saveFailure) {
      setSaveError(
        saveFailure instanceof Error
          ? saveFailure.message
          : "Unable to save vendor.",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, editingVendor]);

  const filterButtons: Array<{
    id: DirectoryFilter;
    label: string;
    count?: number;
  }> = [
    { id: "all", label: "All", count: summary.totalVendors },
    {
      id: "attention",
      label: "Needs attention",
      count: directory.filter((row) => row.issues.length > 0).length,
    },
    { id: "receiving", label: "Receiving" },
    { id: "on_order", label: "On order" },
    { id: "inactive", label: "Inactive" },
    ...(summary.duplicateVendorCandidates > 0
      ? [
          {
            id: "duplicates" as const,
            label: "Duplicates",
            count: summary.duplicateVendorCandidates,
          },
        ]
      : []),
  ];

  return (
    <div className="relative p-4 text-[color:var(--theme-text-primary)] fade-in sm:p-5 md:p-6">
      <PageShell
        eyebrow="Parts · Purchasing"
        title="Vendors"
        description="The working directory for supplier contacts, purchasing activity, receiving, and catalog links."
        actions={
          <>
            {canManageConnections ? (
              <Link
                href="/dashboard/owner/settings#settings-integrations"
                className={ui.buttonSecondary}
              >
                <PlugZap className="mr-1.5 h-4 w-4" />
                Integrations
              </Link>
            ) : null}
            <Link href="/parts/po" className={ui.buttonSecondary}>
              <ClipboardList className="mr-1.5 h-4 w-4" />
              Purchase orders
            </Link>
            <button
              type="button"
              className={ui.buttonPrimary}
              onClick={openCreate}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add vendor
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <SummaryStrip summary={summary} onFilter={applyFilter} />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="min-w-0 space-y-4">
              <AttentionQueue
                summary={summary}
                loading={loading}
                onFilter={applyFilter}
              />

              <section className="overflow-hidden rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg)]">
                <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                        Directory
                      </p>
                      <h2 className="mt-0.5 text-base font-semibold">
                        Supplier records
                      </h2>
                    </div>
                    <label className="relative block w-full xl:max-w-xs">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" />
                      <input
                        className={`${ui.input} pl-9`}
                        placeholder="Search name, contact, or account"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {filterButtons.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setDirectoryFilter(filter.id)}
                        className={
                          directoryFilter === filter.id
                            ? ui.pillActive
                            : ui.pill
                        }
                      >
                        {filter.label}
                        {filter.count !== undefined ? (
                          <span className="ml-1.5 tabular-nums opacity-70">
                            {formatCount(filter.count)}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="hidden grid-cols-[minmax(180px,1.4fr)_minmax(160px,1fr)_150px_120px_20px] gap-3 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)] md:grid">
                  <span>Vendor</span>
                  <span>Contact</span>
                  <span>Purchasing</span>
                  <span>Catalog</span>
                  <span />
                </div>

                {loading ? (
                  <div className="space-y-0">
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        className="flex animate-pulse items-center gap-3 border-t border-[color:var(--theme-border-soft)] px-4 py-4 first:border-t-0"
                      >
                        <div className="h-10 w-10 rounded-xl bg-[color:var(--theme-surface-subtle)]" />
                        <div className="flex-1">
                          <div className="h-3 w-40 rounded bg-[color:var(--theme-surface-subtle)]" />
                          <div className="mt-2 h-2.5 w-28 rounded bg-[color:var(--theme-surface-subtle)]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : vendors.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
                      <Truck className="h-5 w-5 text-[color:var(--theme-text-muted)]" />
                    </div>
                    <h3 className="mt-3 font-semibold">
                      Build your vendor directory
                    </h3>
                    <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[color:var(--theme-text-muted)]">
                      Add the suppliers your parts department buys from so
                      purchase orders and receiving share one vendor record.
                    </p>
                    <button
                      type="button"
                      className={`${ui.buttonPrimary} mt-4`}
                      onClick={openCreate}
                    >
                      Add first vendor
                    </button>
                  </div>
                ) : filteredDirectory.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-[color:var(--theme-text-muted)]">
                    No vendors match this search and filter.
                  </div>
                ) : (
                  <div>
                    {filteredDirectory.map((row) => (
                      <VendorDirectoryRow
                        key={row.supplier.id}
                        row={row}
                        selected={selectedVendorId === row.supplier.id}
                        onSelect={() => openProfile(row)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <VendorPanel
              mode={panelMode}
              row={selectedRow}
              draft={draft}
              busy={saving}
              error={saveError}
              onDraftChange={setDraft}
              onClose={() => {
                if (!saving) setPanelMode(null);
              }}
              onEdit={() => {
                if (selectedRow) openEdit(selectedRow);
              }}
              onCancelForm={cancelForm}
              onSubmit={() => void saveVendor()}
              onShowDuplicates={() => {
                applyFilter("duplicates");
                setPanelMode(null);
              }}
            />
          </div>

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

          <section className="flex flex-col gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--theme-text-muted)]" />
              <div>
                <p className="text-sm font-medium">
                  Looking for integration setup?
                </p>
                <p className="mt-0.5 text-xs leading-5 text-[color:var(--theme-text-muted)]">
                  Vendor records stay here. Accounting and future supplier
                  connections are managed separately by an owner or admin.
                </p>
              </div>
            </div>
            {canManageConnections ? (
              <Link
                href="/dashboard/owner/settings#settings-integrations"
                className={`${ui.buttonSecondary} shrink-0`}
              >
                Open integrations
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            ) : null}
          </section>
        </div>
      </PageShell>
    </div>
  );
}
