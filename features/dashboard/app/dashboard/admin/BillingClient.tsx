"use client";

import React, { useMemo, useState } from "react";
import {
  CreditCard,
  Receipt,
  RefreshCcw,
  ArrowUpRight,
  ShieldCheck,
  Users,
  Building2,
  MapPin,
  BadgeCheck,
  AlertTriangle,
  ExternalLink,
  Download,
  Plus,
} from "lucide-react";

/**
 * BillingClient – FULL UI VERSION (theme-aligned)
 * - Glass cards + copper accent (no orange-400/500)
 * - Includes: Plan, Usage, Payment Method, Billing Details, Taxes, Invoices, History, Actions
 * - Uses mock data placeholders so you can wire Supabase/Stripe later without blocking UI work
 */

/* -------------------------------------------------------------------------- */
/* Mock types + data (replace with real data later)                            */
/* -------------------------------------------------------------------------- */

type BillingStatus = "active" | "past_due" | "trialing" | "canceled";

type PlanKey = "pro30" | "unlimited";

type InvoiceRow = {
  id: string;
  number: string;
  status: "paid" | "open" | "void" | "uncollectible";
  date: string; // ISO or friendly
  amount: string;
  hostedInvoiceUrl?: string;
  pdfUrl?: string;
};

type PaymentMethod = {
  brand: string;
  last4: string;
  expMonth: string;
  expYear: string;
  billingName: string;
};

type BillingProfile = {
  companyName: string;
  contactEmail: string;
  addressLine1: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  taxIdLabel?: string;
  taxIdValue?: string;
};

type BillingSnapshot = {
  status: BillingStatus;
  plan: {
    key: PlanKey;
    name: string;
    interval: "monthly" | "yearly";
    priceLabel: string;
    renewalLabel: string;
    lookupKey: string;
  };
  usage: {
    seatsUsed: number;
    seatsLimit: number | "unlimited";
    activeLocations: number;
  };
  paymentMethod: PaymentMethod;
  billingProfile: BillingProfile;
  taxes: {
    autoTaxEnabled: boolean;
    taxBehavior: "exclusive" | "inclusive";
    region: string;
  };
  invoices: InvoiceRow[];
  history: Array<{ id: string; label: string; meta?: string; at: string }>;
};

const MOCK: BillingSnapshot = {
  status: "active",
  plan: {
    key: "pro30",
    name: "ProFixIQ Pro",
    interval: "monthly",
    priceLabel: "$300 / month",
    renewalLabel: "Renews on Jan 15, 2026",
    lookupKey: "profixiq_pro30_monthly",
  },
  usage: {
    seatsUsed: 7,
    seatsLimit: 30,
    activeLocations: 1,
  },
  paymentMethod: {
    brand: "Visa",
    last4: "4242",
    expMonth: "04",
    expYear: "27",
    billingName: "Edward Lakin",
  },
  billingProfile: {
    companyName: "ProFixIQ Demo Shop",
    contactEmail: "billing@example.com",
    addressLine1: "123 Shop St",
    city: "Vancouver",
    region: "BC",
    postal: "V6B 1A1",
    country: "Canada",
    taxIdLabel: "GST/HST",
    taxIdValue: "123456789RT0001",
  },
  taxes: {
    autoTaxEnabled: true,
    taxBehavior: "exclusive",
    region: "Canada",
  },
  invoices: [
    {
      id: "inv_001",
      number: "INV-0001",
      status: "paid",
      date: "Dec 15, 2025",
      amount: "$300.00",
      hostedInvoiceUrl: "#",
      pdfUrl: "#",
    },
    {
      id: "inv_002",
      number: "INV-0002",
      status: "open",
      date: "Jan 15, 2026",
      amount: "$300.00",
      hostedInvoiceUrl: "#",
      pdfUrl: "#",
    },
  ],
  history: [
    { id: "h1", label: "Subscription created", meta: "ProFixIQ Pro (Monthly)", at: "Dec 15, 2025 • 10:38 AM" },
    { id: "h2", label: "Payment method added", meta: "Visa •••• 4242", at: "Dec 15, 2025 • 10:41 AM" },
    { id: "h3", label: "Invoice paid", meta: "INV-0001", at: "Dec 15, 2025 • 10:42 AM" },
  ],
};

/* -------------------------------------------------------------------------- */
/* Small UI helpers                                                           */
/* -------------------------------------------------------------------------- */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "copper";
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, React.CSSProperties> = {
    neutral: {
      borderColor: "rgba(255,255,255,0.12)",
      backgroundColor: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.82)",
    },
    success: {
      borderColor: "rgba(34,197,94,0.25)",
      backgroundColor: "rgba(34,197,94,0.12)",
      color: "rgba(187,247,208,0.95)",
    },
    warning: {
      borderColor: "rgba(245,158,11,0.25)",
      backgroundColor: "rgba(245,158,11,0.10)",
      color: "rgba(254,243,199,0.95)",
    },
    danger: {
      borderColor: "rgba(239,68,68,0.25)",
      backgroundColor: "rgba(239,68,68,0.12)",
      color: "rgba(254,202,202,0.95)",
    },
    copper: {
      borderColor: "rgba(255,255,255,0.12)",
      backgroundColor: "rgba(193,102,59,0.16)",
      color: "var(--accent-copper-light)",
    },
  };

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold"
      style={styles[tone]}
    >
      {children}
    </span>
  );
}

function GlassCard({
  title,
  icon,
  right,
  children,
  className,
}: {
  title?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl",
        className,
      )}
    >
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            {icon ? <div className="text-neutral-300">{icon}</div> : null}
            {title ? (
              <h2 className="text-sm font-semibold text-neutral-200">{title}</h2>
            ) : null}
          </div>
          {right ? <div>{right}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}

function CopperButton({
  children,
  onClick,
  icon,
  className,
  disabled,
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-black transition",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      style={{ backgroundColor: "var(--accent-copper)" }}
    >
      {icon ? <span className="opacity-90">{icon}</span> : null}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  icon,
  className,
  disabled,
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-sm font-semibold text-neutral-200",
        "transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {icon ? <span className="text-neutral-300">{icon}</span> : null}
      {children}
    </button>
  );
}

function Divider() {
  return <div className="my-6 h-px bg-white/10" />;
}

function StatusPill({ status }: { status: BillingStatus }) {
  if (status === "active")
    return (
      <Badge tone="success">
        <BadgeCheck size={14} />
        Active
      </Badge>
    );

  if (status === "trialing")
    return (
      <Badge tone="copper">
        <ShieldCheck size={14} />
        Trial
      </Badge>
    );

  if (status === "past_due")
    return (
      <Badge tone="warning">
        <AlertTriangle size={14} />
        Past due
      </Badge>
    );

  return (
    <Badge tone="danger">
      <AlertTriangle size={14} />
      Canceled
    </Badge>
  );
}

function InvoiceStatusBadge({ s }: { s: InvoiceRow["status"] }) {
  const map: Record<InvoiceRow["status"], { tone: any; label: string }> = {
    paid: { tone: "success", label: "Paid" },
    open: { tone: "warning", label: "Open" },
    void: { tone: "neutral", label: "Void" },
    uncollectible: { tone: "danger", label: "Uncollectible" },
  };
  const v = map[s];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

/* -------------------------------------------------------------------------- */
/* Main Component                                                             */
/* -------------------------------------------------------------------------- */

export default function BillingClient() {
  const data = useMemo(() => MOCK, []);
  const [invoiceFilter, setInvoiceFilter] = useState<
    "all" | "paid" | "open" | "void" | "uncollectible"
  >("all");

  const filteredInvoices = useMemo(() => {
    if (invoiceFilter === "all") return data.invoices;
    return data.invoices.filter((i) => i.status === invoiceFilter);
  }, [data.invoices, invoiceFilter]);

  const seatsLabel =
    data.usage.seatsLimit === "unlimited"
      ? "Unlimited"
      : `${data.usage.seatsUsed} / ${data.usage.seatsLimit}`;

  const usagePct =
    data.usage.seatsLimit === "unlimited"
      ? 0.25
      : Math.min(1, data.usage.seatsUsed / Math.max(1, data.usage.seatsLimit));

  /* ---------------------------------------------------------------------- */
  /* TODO: Wire these actions (Stripe customer portal + invoices)            */
  /* ---------------------------------------------------------------------- */
  const actions = {
    openCustomerPortal: () => {
      // TODO: call /api/stripe/portal (recommended), then window.location = url
      console.log("TODO: open customer portal");
    },
    changePlan: () => {
      // TODO: navigate to /subscribe or open plan modal
      console.log("TODO: change plan");
    },
    updatePaymentMethod: () => {
      // TODO: customer portal -> update payment method
      console.log("TODO: update payment method");
    },
    viewInvoices: () => {
      // TODO: scroll to invoices section or open invoices modal
      document.getElementById("billing-invoices")?.scrollIntoView({ behavior: "smooth" });
    },
    refreshBilling: () => {
      // TODO: refetch billing snapshot from server
      console.log("TODO: refresh billing snapshot");
    },
  };

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-2xl"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            Billing
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Subscription, invoices, payment method, and tax settings.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <GhostButton
            onClick={actions.refreshBilling}
            icon={<RefreshCcw size={16} />}
          >
            Refresh
          </GhostButton>

          <GhostButton
            onClick={actions.openCustomerPortal}
            icon={<ArrowUpRight size={16} />}
            title="Recommended: manage billing in Stripe Customer Portal"
          >
            Open billing portal
          </GhostButton>

          <CopperButton
            onClick={actions.changePlan}
            icon={<ExternalLink size={16} />}
          >
            Change plan
          </CopperButton>
        </div>
      </div>

      {/* Top grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Plan + status */}
        <GlassCard
          title="Subscription"
          icon={<ShieldCheck size={16} />}
          right={<StatusPill status={data.status} />}
          className="lg:col-span-2"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Current plan
              </p>
              <p
                className="mt-1 text-xl font-semibold"
                style={{ color: "var(--accent-copper-light)" }}
              >
                {data.plan.name}
              </p>
              <p className="mt-1 text-sm text-neutral-300">
                {data.plan.priceLabel} • {data.plan.interval}
              </p>
              <p className="mt-1 text-xs text-neutral-500">{data.plan.renewalLabel}</p>

              <div className="mt-3">
                <Badge tone="neutral">
                  Lookup key: <span className="font-mono">{data.plan.lookupKey}</span>
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <GhostButton
                onClick={actions.viewInvoices}
                icon={<Receipt size={16} />}
              >
                View invoices
              </GhostButton>
              <GhostButton
                onClick={actions.openCustomerPortal}
                icon={<ArrowUpRight size={16} />}
              >
                Manage in portal
              </GhostButton>
            </div>
          </div>

          <Divider />

          {/* Usage */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-neutral-400">
                  Seats
                </p>
                <Users size={16} className="text-neutral-400" />
              </div>
              <p className="mt-2 text-sm font-semibold text-neutral-200">
                {seatsLabel}
              </p>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(usagePct * 100)}%`,
                    backgroundColor: "var(--accent-copper)",
                    opacity: 0.9,
                  }}
                />
              </div>

              <p className="mt-2 text-xs text-neutral-500">
                Track active users across your shop.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-neutral-400">
                  Locations
                </p>
                <MapPin size={16} className="text-neutral-400" />
              </div>
              <p className="mt-2 text-sm font-semibold text-neutral-200">
                {data.usage.activeLocations}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                Multi-location support is included.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-neutral-400">
                  Billing status
                </p>
                <ShieldCheck size={16} className="text-neutral-400" />
              </div>
              <p className="mt-2 text-sm font-semibold text-neutral-200 capitalize">
                {data.status.replace("_", " ")}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                Issues show here (failed payment, past due, etc).
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Payment Method */}
        <GlassCard title="Payment method" icon={<CreditCard size={16} />}>
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-200">
                  {data.paymentMethod.brand} •••• {data.paymentMethod.last4}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Expires {data.paymentMethod.expMonth}/{data.paymentMethod.expYear}
                </p>
                <p className="mt-2 text-xs text-neutral-400">
                  Billing name:{" "}
                  <span className="text-neutral-200">
                    {data.paymentMethod.billingName}
                  </span>
                </p>
              </div>

              <Badge tone="copper">Default</Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <GhostButton
                onClick={actions.updatePaymentMethod}
                icon={<ArrowUpRight size={16} />}
              >
                Update in portal
              </GhostButton>

              <GhostButton
                onClick={() => console.log("TODO: add payment method")}
                icon={<Plus size={16} />}
              >
                Add new
              </GhostButton>
            </div>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Tip: Use Stripe Customer Portal for payment updates to keep PCI handling off your app.
          </p>
        </GlassCard>
      </div>

      {/* Second row */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Billing details */}
        <GlassCard
          title="Billing details"
          icon={<Building2 size={16} />}
          className="lg:col-span-2"
          right={<Badge tone="neutral">Stored</Badge>}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Company
              </p>
              <p className="mt-2 text-sm font-semibold text-neutral-200">
                {data.billingProfile.companyName}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {data.billingProfile.contactEmail}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Address
              </p>
              <p className="mt-2 text-sm text-neutral-200">
                {data.billingProfile.addressLine1}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {data.billingProfile.city}, {data.billingProfile.region}{" "}
                {data.billingProfile.postal}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {data.billingProfile.country}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <GhostButton
              onClick={actions.openCustomerPortal}
              icon={<ArrowUpRight size={16} />}
            >
              Edit details in portal
            </GhostButton>
            <GhostButton
              onClick={() => console.log("TODO: update billing profile in-app")}
              icon={<ExternalLink size={16} />}
            >
              Edit in app (later)
            </GhostButton>
          </div>
        </GlassCard>

        {/* Tax */}
        <GlassCard title="Taxes" icon={<ShieldCheck size={16} />}>
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-200">
                  {data.taxes.autoTaxEnabled ? "Automatic tax" : "Manual tax"}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Region: {data.taxes.region}
                </p>
                <p className="mt-2 text-xs text-neutral-400">
                  Behavior:{" "}
                  <span className="text-neutral-200">
                    {data.taxes.taxBehavior === "exclusive"
                      ? "Tax added at checkout"
                      : "Tax included in price"}
                  </span>
                </p>
              </div>
              <Badge tone={data.taxes.autoTaxEnabled ? "success" : "neutral"}>
                {data.taxes.autoTaxEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            {data.billingProfile.taxIdLabel && data.billingProfile.taxIdValue ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3">
                <p className="text-xs text-neutral-400">
                  {data.billingProfile.taxIdLabel}
                </p>
                <p className="mt-1 text-sm font-mono text-neutral-200">
                  {data.billingProfile.taxIdValue}
                </p>
              </div>
            ) : null}
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Configure taxes in Stripe to keep billing consistent across regions.
          </p>
        </GlassCard>
      </div>

      {/* Invoices */}
      <div id="billing-invoices" className="mt-6">
        <GlassCard
          title="Invoices"
          icon={<Receipt size={16} />}
          right={
            <div className="flex items-center gap-2">
              <select
                value={invoiceFilter}
                onChange={(e) =>
                  setInvoiceFilter(e.target.value as typeof invoiceFilter)
                }
                className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-neutral-200 outline-none"
              >
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="open">Open</option>
                <option value="void">Void</option>
                <option value="uncollectible">Uncollectible</option>
              </select>

              <GhostButton
                onClick={actions.openCustomerPortal}
                icon={<ArrowUpRight size={16} />}
                className="px-3 py-2 text-xs"
              >
                Portal
              </GhostButton>
            </div>
          }
        >
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-12 bg-black/45 px-4 py-3 text-xs font-semibold text-neutral-300">
              <div className="col-span-4 sm:col-span-3">Invoice</div>
              <div className="col-span-4 sm:col-span-3">Date</div>
              <div className="col-span-4 sm:col-span-2 text-right">Amount</div>
              <div className="col-span-6 sm:col-span-2 text-right hidden sm:block">
                Status
              </div>
              <div className="col-span-4 sm:col-span-2 text-right">Actions</div>
            </div>

            <div className="divide-y divide-white/10 bg-black/30">
              {filteredInvoices.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  No invoices match this filter.
                </div>
              ) : (
                filteredInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="grid grid-cols-12 items-center px-4 py-3 text-sm"
                  >
                    <div className="col-span-4 sm:col-span-3">
                      <div className="font-semibold text-neutral-200">
                        {inv.number}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {inv.id}
                      </div>
                    </div>

                    <div className="col-span-4 sm:col-span-3 text-neutral-300">
                      {inv.date}
                    </div>

                    <div className="col-span-4 sm:col-span-2 text-right font-semibold text-neutral-200">
                      {inv.amount}
                    </div>

                    <div className="col-span-6 sm:col-span-2 justify-end hidden sm:flex">
                      <InvoiceStatusBadge s={inv.status} />
                    </div>

                    <div className="col-span-4 sm:col-span-2 flex justify-end gap-2">
                      <GhostButton
                        onClick={() => console.log("TODO: open hosted invoice", inv.hostedInvoiceUrl)}
                        icon={<ExternalLink size={16} />}
                        className="px-3 py-2 text-xs"
                        title="Open invoice"
                      >
                        Open
                      </GhostButton>

                      <GhostButton
                        onClick={() => console.log("TODO: download PDF", inv.pdfUrl)}
                        icon={<Download size={16} />}
                        className="px-3 py-2 text-xs"
                        title="Download PDF"
                      >
                        PDF
                      </GhostButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            You can also show invoices from your own{" "}
            <span className="font-mono">subscriptions</span> /{" "}
            <span className="font-mono">invoices</span> tables once you persist them.
          </p>
        </GlassCard>
      </div>

      {/* History */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard title="Billing activity" icon={<Receipt size={16} />} className="lg:col-span-2">
          <div className="space-y-3">
            {data.history.map((h) => (
              <div
                key={h.id}
                className="rounded-xl border border-white/10 bg-black/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-200">
                      {h.label}
                    </p>
                    {h.meta ? (
                      <p className="mt-1 text-xs text-neutral-500">{h.meta}</p>
                    ) : null}
                  </div>
                  <p className="text-xs text-neutral-500">{h.at}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Developer / Wiring notes */}
        <GlassCard title="Wiring checklist" icon={<ShieldCheck size={16} />}>
          <div className="space-y-3 text-sm text-neutral-300">
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Recommended endpoints
              </p>
              <ul className="mt-2 space-y-2 text-xs text-neutral-400">
                <li>
                  <span className="font-mono text-neutral-200">POST /api/stripe/portal</span>{" "}
                  → returns {`{ url }`}
                </li>
                <li>
                  <span className="font-mono text-neutral-200">GET /api/billing/snapshot</span>{" "}
                  → plan/status/payment/invoices
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Keep secrets server-only
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                Use Stripe secret key only inside route handlers / server actions.
                Client should only receive portal URLs + safe invoice links.
              </p>
            </div>

            <GhostButton
              onClick={() => console.log("TODO: navigate to billing docs")}
              icon={<ArrowUpRight size={16} />}
              className="w-full justify-center"
            >
              Open billing docs (later)
            </GhostButton>
          </div>
        </GlassCard>
      </div>

      {/* Footer note */}
      <div className="mt-6 text-xs text-neutral-500">
        Taxes and invoices reflect your Stripe configuration. Cancel anytime from the billing portal.
      </div>
    </div>
  );
}