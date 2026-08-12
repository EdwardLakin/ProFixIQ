"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  CalendarRange,
  Check,
  History,
  Loader2,
  Plus,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

type AgreementSource =
  | "customer_specific"
  | "customer_contract"
  | "fleet_contract";

type PricingAgreement = {
  id: string;
  source_type: AgreementSource;
  name: string;
  status: "active" | "superseded" | "retired";
  currency: "CAD" | "USD";
  labor_rate: number | null;
  labor_discount_percent: number;
  parts_discount_percent: number;
  parts_markup_matrix: MatrixTier[];
  minimum_parts_margin_percent: number;
  customer_fee_type: "none" | "flat" | "percentage";
  customer_fee_value: number;
  customer_fee_cap: number | null;
  expiry_warning_days: number;
  effective_from: string;
  effective_until: string | null;
  approval_reason: string;
  notes: string | null;
  retired_reason: string | null;
  created_at: string;
};

type MatrixTier = {
  cost_from: number;
  cost_to: number | null;
  markup_percent: number;
};

type MatrixTierDraft = {
  costFrom: string;
  costTo: string;
  markupPercent: string;
};

type PricingSummary = {
  ok: boolean;
  account_type: string | null;
  is_fleet: boolean;
  has_linked_fleet: boolean;
  can_manage: boolean;
  effective_agreement: PricingAgreement | null;
  agreements: PricingAgreement[];
};

type Props = {
  customerId: string;
};

type Draft = {
  sourceType: AgreementSource;
  name: string;
  currency: "CAD" | "USD";
  laborStrategy: "fixed" | "discount" | "none";
  laborRate: string;
  laborDiscountPercent: string;
  partsDiscountPercent: string;
  partsMarkupMatrix: MatrixTierDraft[];
  minimumPartsMarginPercent: string;
  customerFeeType: "none" | "flat" | "percentage";
  customerFeeValue: string;
  customerFeeCap: string;
  expiryWarningDays: string;
  effectiveFrom: string;
  effectiveUntil: string;
  approvalReason: string;
  notes: string;
};

const inputClass =
  "w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none focus:border-[var(--accent-copper)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(sourceType: AgreementSource): Draft {
  return {
    sourceType,
    name: "",
    currency: "CAD",
    laborStrategy: "fixed",
    laborRate: "",
    laborDiscountPercent: "",
    partsDiscountPercent: "",
    partsMarkupMatrix: [],
    minimumPartsMarginPercent: "",
    customerFeeType: "none",
    customerFeeValue: "",
    customerFeeCap: "",
    expiryWarningDays: "30",
    effectiveFrom: today(),
    effectiveUntil: "",
    approvalReason: "",
    notes: "",
  };
}

function sourceLabel(source: AgreementSource): string {
  if (source === "fleet_contract") return "Fleet contract";
  if (source === "customer_contract") return "Business contract";
  return "Customer-specific rate";
}

function agreementTerms(agreement: PricingAgreement): string[] {
  const terms: string[] = [];
  if (agreement.labor_rate != null) {
    terms.push(
      `${agreement.currency} $${agreement.labor_rate.toFixed(2)}/hr labor`,
    );
  } else if (agreement.labor_discount_percent > 0) {
    terms.push(`${agreement.labor_discount_percent}% off labor rate`);
  }
  if (agreement.parts_discount_percent > 0) {
    terms.push(`${agreement.parts_discount_percent}% off parts sell price`);
  }
  if (agreement.parts_markup_matrix?.length > 0) {
    terms.push(`${agreement.parts_markup_matrix.length}-tier parts matrix`);
  }
  if (agreement.minimum_parts_margin_percent > 0) {
    terms.push(`${agreement.minimum_parts_margin_percent}% minimum parts margin`);
  }
  if (agreement.customer_fee_type !== "none") {
    terms.push(
      agreement.customer_fee_type === "flat"
        ? `${agreement.currency} $${agreement.customer_fee_value.toFixed(2)} customer fee`
        : `${agreement.customer_fee_value}% customer fee${agreement.customer_fee_cap != null ? ` (max $${agreement.customer_fee_cap.toFixed(2)})` : ""}`,
    );
  }
  return terms;
}

function daysUntil(date: string): number {
  const end = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today()}T00:00:00Z`);
  return Math.ceil((end - now) / 86_400_000);
}

function effectiveWindow(agreement: PricingAgreement): string {
  return agreement.effective_until
    ? `${agreement.effective_from} – ${agreement.effective_until}`
    : `${agreement.effective_from} onward`;
}

export function CustomerPricingPanel({ customerId }: Props) {
  const [summary, setSummary] = useState<PricingSummary | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);
  const [retirementReason, setRetirementReason] = useState("");
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft("customer_specific"),
  );

  const defaultSource = useMemo<AgreementSource>(() => {
    if (summary?.has_linked_fleet) return "fleet_contract";
    if (
      summary?.account_type === "business" ||
      summary?.account_type === "enterprise"
    ) {
      return "customer_contract";
    }
    return "customer_specific";
  }, [summary?.account_type, summary?.has_linked_fleet]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${customerId}/pricing`, {
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setAvailable(false);
        return;
      }
      const payload = (await response.json().catch(() => null)) as
        | (PricingSummary & { error?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(
          payload?.error ?? "Customer pricing could not be loaded.",
        );
      }
      setSummary(payload);
      setAvailable(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Customer pricing could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showForm) setDraft(emptyDraft(defaultSource));
  }, [defaultSource, showForm]);

  async function saveAgreement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/customers/${customerId}/pricing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          sourceType: draft.sourceType,
          name: draft.name,
          currency: draft.currency,
          laborRate: draft.laborStrategy === "fixed" ? draft.laborRate : null,
          laborDiscountPercent:
            draft.laborStrategy === "discount"
              ? Number(draft.laborDiscountPercent || 0)
              : 0,
          partsDiscountPercent: Number(draft.partsDiscountPercent || 0),
          partsMarkupMatrix: draft.partsMarkupMatrix.map((tier) => ({
            costFrom: Number(tier.costFrom),
            costTo: tier.costTo === "" ? null : Number(tier.costTo),
            markupPercent: Number(tier.markupPercent),
          })),
          minimumPartsMarginPercent: Number(
            draft.minimumPartsMarginPercent || 0,
          ),
          customerFeeType: draft.customerFeeType,
          customerFeeValue:
            draft.customerFeeType === "none"
              ? 0
              : Number(draft.customerFeeValue || 0),
          customerFeeCap:
            draft.customerFeeCap === ""
              ? null
              : Number(draft.customerFeeCap),
          expiryWarningDays: Number(draft.expiryWarningDays || 30),
          effectiveFrom: draft.effectiveFrom,
          effectiveUntil: draft.effectiveUntil || null,
          approvalReason: draft.approvalReason,
          notes: draft.notes || null,
          operationKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Pricing agreement could not be saved.",
        );
      }
      toast.success("Customer pricing agreement activated.");
      setShowForm(false);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Pricing agreement could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function retireAgreement(agreementId: string) {
    if (saving || retirementReason.trim().length < 3) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/customers/${customerId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreementId,
          reason: retirementReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Pricing agreement could not be retired.",
        );
      }
      toast.success(
        "Pricing agreement retired. Existing sent quotes are unchanged.",
      );
      setRetiringId(null);
      setRetirementReason("");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Pricing agreement could not be retired.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!available) return null;

  const effective = summary?.effective_agreement ?? null;
  const agreements = summary?.agreements ?? [];
  const expiringAgreements = agreements.filter((agreement) => {
    if (agreement.status !== "active" || !agreement.effective_until) {
      return false;
    }
    const remaining = daysUntil(agreement.effective_until);
    return remaining >= 0 && remaining <= agreement.expiry_warning_days;
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--accent-copper-soft)]/45 bg-[radial-gradient(circle_at_top_right,rgba(197,122,74,0.16),transparent_38%),color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
      <div className="border-b border-[color:var(--desktop-border)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-[var(--accent-copper-soft)]/50 bg-[var(--accent-copper)]/10 p-2.5 text-[var(--accent-copper)]">
              <BadgeDollarSign className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">
                Dedicated pricing
              </div>
              <h2 className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                Customer labor & parts terms
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-[color:var(--theme-text-secondary)]">
                Shop-owned pricing resolves automatically on editable quotes.
                Sent approvals and invoices keep their original snapshot.
              </p>
            </div>
          </div>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-copper)]" />
          ) : summary?.can_manage ? (
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-copper)] px-3 py-2 text-xs font-bold text-[color:var(--theme-text-on-accent)] hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" />
              New agreement
            </button>
          ) : null}
        </div>
      </div>

      {expiringAgreements.length > 0 ? (
        <div className="border-b border-amber-300/25 bg-amber-400/10 px-4 py-3 sm:px-5">
          <div className="flex items-start gap-2 text-xs text-amber-100">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-bold">Contract expiry:</span>{" "}
              {expiringAgreements
                .map(
                  (agreement) =>
                    `${agreement.name} ends in ${daysUntil(agreement.effective_until!)} day(s)`,
                )
                .join(" · ")}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Effective now
          </div>
          {effective ? (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[color:var(--theme-text-primary)]">
                  {effective.name}
                </h3>
                <span className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                  {sourceLabel(effective.source_type)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {agreementTerms(effective).map((term) => (
                  <div
                    key={term}
                    className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3 text-sm font-semibold text-[color:var(--theme-text-primary)]"
                  >
                    <Check className="mr-1.5 inline h-4 w-4 text-emerald-400" />
                    {term}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-[color:var(--theme-text-secondary)]">
                <CalendarRange className="h-3.5 w-3.5" />
                {effectiveWindow(effective)}
              </div>
              <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
                Approved because: {effective.approval_reason}
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-[color:var(--desktop-border)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
              Shop defaults apply. Add a customer rate or contract when this
              account receives negotiated pricing.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Fixed precedence
          </div>
          <ol className="mt-3 space-y-2 text-xs text-[color:var(--theme-text-secondary)]">
            {[
              "Approved manual override",
              "Fleet or business contract",
              "Customer-specific rate",
              "Shop default",
            ].map((label, index) => (
              <li key={label} className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--accent-copper-soft)]/45 bg-[var(--accent-copper)]/10 font-bold text-[var(--accent-copper)]">
                  {index + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--theme-text-muted)]">
            Staff cannot invent priority numbers. The engine selects one winner,
            records the original values, and exposes the resolved source on the
            quote.
          </p>
        </div>
      </div>

      {showForm && summary?.can_manage ? (
        <form
          onSubmit={saveAgreement}
          className="border-t border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] p-4 sm:p-5"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Agreement type
              <select
                value={draft.sourceType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sourceType: event.target.value as AgreementSource,
                  }))
                }
                className={`mt-1 ${inputClass}`}
              >
                <option value="customer_specific">
                  Customer-specific rate
                </option>
                <option value="customer_contract">Business contract</option>
                {summary.has_linked_fleet ? (
                  <option value="fleet_contract">Fleet contract</option>
                ) : null}
              </select>
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)] md:col-span-1 xl:col-span-2">
              Agreement name
              <input
                required
                maxLength={120}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Example: Northside Fleet 2026"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Currency
              <select
                value={draft.currency}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    currency: event.target.value as "CAD" | "USD",
                  }))
                }
                className={`mt-1 ${inputClass}`}
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Labor treatment
              <select
                value={draft.laborStrategy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    laborStrategy: event.target.value as Draft["laborStrategy"],
                  }))
                }
                className={`mt-1 ${inputClass}`}
              >
                <option value="fixed">Fixed hourly rate</option>
                <option value="discount">Percent off shop rate</option>
                <option value="none">No labor adjustment</option>
              </select>
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              {draft.laborStrategy === "discount"
                ? "Labor discount %"
                : "Fixed labor rate"}
              <input
                required={draft.laborStrategy !== "none"}
                disabled={draft.laborStrategy === "none"}
                inputMode="decimal"
                value={
                  draft.laborStrategy === "discount"
                    ? draft.laborDiscountPercent
                    : draft.laborRate
                }
                onChange={(event) =>
                  setDraft((current) =>
                    current.laborStrategy === "discount"
                      ? {
                          ...current,
                          laborDiscountPercent: event.target.value,
                        }
                      : { ...current, laborRate: event.target.value },
                  )
                }
                placeholder={
                  draft.laborStrategy === "discount" ? "10" : "125.00"
                }
                className={`mt-1 ${inputClass} disabled:opacity-45`}
              />
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Parts sell discount %
              <input
                inputMode="decimal"
                value={draft.partsDiscountPercent}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    partsDiscountPercent: event.target.value,
                  }))
                }
                placeholder="5"
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                  Parts matrix
                </div>
                <p className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                  Cost bands set sell markup before any customer discount. Leave
                  empty to preserve the quoted base sell price.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    partsMarkupMatrix: [
                      ...current.partsMarkupMatrix,
                      {
                        costFrom:
                          current.partsMarkupMatrix.length === 0 ? "0" : "",
                        costTo: "",
                        markupPercent: "",
                      },
                    ],
                  }))
                }
                className="rounded-lg border border-[var(--accent-copper-soft)]/45 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent-copper)]"
              >
                Add cost band
              </button>
            </div>
            {draft.partsMarkupMatrix.length > 0 ? (
              <div className="mt-3 space-y-2">
                {draft.partsMarkupMatrix.map((tier, index) => (
                  <div
                    key={`${index}-${tier.costFrom}`}
                    className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"
                  >
                    <input
                      required
                      inputMode="decimal"
                      aria-label={`Tier ${index + 1} cost from`}
                      placeholder="Cost from"
                      value={tier.costFrom}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          partsMarkupMatrix: current.partsMarkupMatrix.map(
                            (item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, costFrom: event.target.value }
                                : item,
                          ),
                        }))
                      }
                      className={inputClass}
                    />
                    <input
                      required={index < draft.partsMarkupMatrix.length - 1}
                      inputMode="decimal"
                      aria-label={`Tier ${index + 1} cost to`}
                      placeholder={
                        index === draft.partsMarkupMatrix.length - 1
                          ? "No maximum"
                          : "Cost to"
                      }
                      value={tier.costTo}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          partsMarkupMatrix: current.partsMarkupMatrix.map(
                            (item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, costTo: event.target.value }
                                : item,
                          ),
                        }))
                      }
                      className={inputClass}
                    />
                    <input
                      required
                      inputMode="decimal"
                      aria-label={`Tier ${index + 1} markup percent`}
                      placeholder="Markup %"
                      value={tier.markupPercent}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          partsMarkupMatrix: current.partsMarkupMatrix.map(
                            (item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    markupPercent: event.target.value,
                                  }
                                : item,
                          ),
                        }))
                      }
                      className={inputClass}
                    />
                    <button
                      type="button"
                      aria-label={`Remove tier ${index + 1}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          partsMarkupMatrix: current.partsMarkupMatrix.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        }))
                      }
                      className="rounded-xl border border-[color:var(--desktop-border)] px-2 text-[color:var(--theme-text-secondary)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Minimum parts margin %
              <input
                inputMode="decimal"
                value={draft.minimumPartsMarginPercent}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    minimumPartsMarginPercent: event.target.value,
                  }))
                }
                placeholder="Example: 25"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Customer fee
              <select
                value={draft.customerFeeType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    customerFeeType: event.target.value as Draft["customerFeeType"],
                  }))
                }
                className={`mt-1 ${inputClass}`}
              >
                <option value="none">No customer fee</option>
                <option value="flat">Flat amount</option>
                <option value="percentage">Percent of labor + parts</option>
              </select>
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Fee {draft.customerFeeType === "percentage" ? "%" : "amount"}
              <input
                disabled={draft.customerFeeType === "none"}
                required={draft.customerFeeType !== "none"}
                inputMode="decimal"
                value={draft.customerFeeValue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    customerFeeValue: event.target.value,
                  }))
                }
                className={`mt-1 ${inputClass} disabled:opacity-45`}
              />
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Fee cap (optional)
              <input
                disabled={draft.customerFeeType !== "percentage"}
                inputMode="decimal"
                value={draft.customerFeeCap}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    customerFeeCap: event.target.value,
                  }))
                }
                className={`mt-1 ${inputClass} disabled:opacity-45`}
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Effective from
              <input
                required
                type="date"
                value={draft.effectiveFrom}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    effectiveFrom: event.target.value,
                  }))
                }
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Ends (optional)
              <input
                type="date"
                min={draft.effectiveFrom}
                value={draft.effectiveUntil}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    effectiveUntil: event.target.value,
                  }))
                }
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Expiry warning days
              <input
                required
                type="number"
                min={0}
                max={365}
                value={draft.expiryWarningDays}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    expiryWarningDays: event.target.value,
                  }))
                }
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)] md:col-span-2">
              Approval reason
              <input
                required
                minLength={3}
                maxLength={500}
                value={draft.approvalReason}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    approvalReason: event.target.value,
                  }))
                }
                placeholder="Signed fleet agreement, volume commitment, preferred customer…"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)] md:col-span-2">
              Internal notes (optional)
              <textarea
                maxLength={2000}
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={2}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-[color:var(--desktop-border)] px-4 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-xs font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-55"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Activate agreement
            </button>
          </div>
        </form>
      ) : null}

      {agreements.length > 0 ? (
        <div className="border-t border-[color:var(--desktop-border)] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            <History className="h-4 w-4" /> Agreement history
          </div>
          <div className="mt-3 space-y-2">
            {agreements.map((agreement) => (
              <div
                key={agreement.id}
                className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {agreement.name}
                      </span>
                      <span className="rounded-full border border-[color:var(--desktop-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                        {agreement.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {sourceLabel(agreement.source_type)} ·{" "}
                      {agreementTerms(agreement).join(" · ")} ·{" "}
                      {effectiveWindow(agreement)}
                    </div>
                    {agreement.retired_reason ? (
                      <div className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
                        {agreement.retired_reason}
                      </div>
                    ) : null}
                  </div>
                  {summary?.can_manage && agreement.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRetiringId(
                          retiringId === agreement.id ? null : agreement.id,
                        );
                        setRetirementReason("");
                      }}
                      className="rounded-lg border border-amber-300/35 bg-amber-400/10 px-2.5 py-1.5 text-xs font-semibold text-amber-100"
                    >
                      Retire
                    </button>
                  ) : null}
                </div>
                {retiringId === agreement.id ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      autoFocus
                      value={retirementReason}
                      onChange={(event) =>
                        setRetirementReason(event.target.value)
                      }
                      placeholder="Why is this agreement ending?"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={saving || retirementReason.trim().length < 3}
                      onClick={() => void retireAgreement(agreement.id)}
                      className="rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-xs font-bold text-amber-50 disabled:opacity-45"
                    >
                      Confirm retirement
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
