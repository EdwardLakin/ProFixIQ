"use client";

import Link from "next/link";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { OwnerSettingsPanel } from "@/features/dashboard/components/owner-settings/OwnerSettingsPanels";

type Props = {
  isUnlocked: boolean;
  currency: string;
  taxLabel: string;
  laborRate: string;
  suppliesEnabled: boolean;
  suppliesType: "percentage" | "flat";
  suppliesPercent: string;
  suppliesFlatAmount: string;
  suppliesCapAmount: string;
  diagnosticFee: string;
  taxRate: string;
  pricingValidDays: number;
  pricingValidDaysLoading: boolean;
  pricingValidDaysSaving: boolean;
  requireCauseCorrection: boolean;
  requireAuthorization: boolean;
  autoGeneratePdf: boolean;
  autoSendQuoteEmail: boolean;
  appearanceMode: "dark" | "light" | "system";
  appearanceSaving: boolean;
  onLaborRateChange: (value: string) => void;
  onSuppliesEnabledChange: (value: boolean) => void;
  onSuppliesTypeChange: (value: "percentage" | "flat") => void;
  onSuppliesPercentChange: (value: string) => void;
  onSuppliesFlatAmountChange: (value: string) => void;
  onSuppliesCapAmountChange: (value: string) => void;
  onDiagnosticFeeChange: (value: string) => void;
  onTaxRateChange: (value: string) => void;
  onPricingValidDaysChange: (value: number) => void;
  onSavePricingValidDays: () => void;
  onRequireCauseCorrectionChange: (value: boolean) => void;
  onRequireAuthorizationChange: (value: boolean) => void;
  onAutoGeneratePdfChange: (value: boolean) => void;
  onAutoSendQuoteEmailChange: (value: boolean) => void;
  onAppearanceModeChange: (value: "dark" | "light" | "system") => void;
};

export default function OwnerSettingsOperationsSection({
  isUnlocked,
  currency,
  taxLabel,
  laborRate,
  suppliesEnabled,
  suppliesType,
  suppliesPercent,
  suppliesFlatAmount,
  suppliesCapAmount,
  diagnosticFee,
  taxRate,
  pricingValidDays,
  pricingValidDaysLoading,
  pricingValidDaysSaving,
  requireCauseCorrection,
  requireAuthorization,
  autoGeneratePdf,
  autoSendQuoteEmail,
  appearanceMode,
  appearanceSaving,
  onLaborRateChange,
  onSuppliesEnabledChange,
  onSuppliesTypeChange,
  onSuppliesPercentChange,
  onSuppliesFlatAmountChange,
  onSuppliesCapAmountChange,
  onDiagnosticFeeChange,
  onTaxRateChange,
  onPricingValidDaysChange,
  onSavePricingValidDays,
  onRequireCauseCorrectionChange,
  onRequireAuthorizationChange,
  onAutoGeneratePdfChange,
  onAutoSendQuoteEmailChange,
  onAppearanceModeChange,
}: Props) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <OwnerSettingsPanel
        id="operations-defaults"
        tone="secondary"
        title="Operations defaults"
        description="Default pricing values used across work orders and quotes."
      >
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--theme-text-secondary)]">
              Labor rate · {currency}/hour
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={laborRate}
              onChange={(e) => onLaborRateChange(e.target.value)}
              placeholder="145.00"
              disabled={!isUnlocked}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-xs text-[color:var(--theme-text-secondary)] md:col-span-2">
            <input
              type="checkbox"
              checked={suppliesEnabled}
              onChange={(e) => onSuppliesEnabledChange(e.target.checked)}
              disabled={!isUnlocked}
              className="h-4 w-4 accent-[color:var(--brand-accent,#E39A6E)]"
            />
            <span>
              <span className="block font-semibold text-[color:var(--theme-text-primary)]">
                Automatically apply shop supplies
              </span>
              <span className="mt-0.5 block text-[color:var(--theme-text-muted)]">
                Adds the configured fee to eligible quotes and invoices.
              </span>
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--theme-text-secondary)]">
              Supplies calculation
            </span>
            <select
              value={suppliesType}
              onChange={(e) =>
                onSuppliesTypeChange(
                  e.target.value === "flat" ? "flat" : "percentage",
                )
              }
              disabled={!isUnlocked || !suppliesEnabled}
              className="h-10 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)] disabled:opacity-60"
            >
              <option value="percentage">Percentage</option>
              <option value="flat">Flat amount</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--theme-text-secondary)]">
              Supplies percentage · %
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={suppliesPercent}
              onChange={(e) => onSuppliesPercentChange(e.target.value)}
              placeholder="5.00"
              disabled={
                !isUnlocked || !suppliesEnabled || suppliesType !== "percentage"
              }
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--theme-text-secondary)]">
              Flat supplies amount · {currency}
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={suppliesFlatAmount}
              onChange={(e) => onSuppliesFlatAmountChange(e.target.value)}
              placeholder="15.00"
              disabled={
                !isUnlocked || !suppliesEnabled || suppliesType !== "flat"
              }
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--theme-text-secondary)]">
              Optional supplies cap · {currency}
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={suppliesCapAmount}
              onChange={(e) => onSuppliesCapAmountChange(e.target.value)}
              placeholder="75.00"
              disabled={!isUnlocked || !suppliesEnabled}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--theme-text-secondary)]">
              Diagnostic fee · {currency}
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={diagnosticFee}
              onChange={(e) => onDiagnosticFeeChange(e.target.value)}
              placeholder="125.00"
              disabled={!isUnlocked}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--theme-text-secondary)]">
              {taxLabel}
            </span>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={taxRate}
              onChange={(e) => onTaxRateChange(e.target.value)}
              placeholder="5.00"
              disabled={!isUnlocked}
            />
          </label>
        </div>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="customer-portal-enrollment"
        tone="primary"
        title="Customer portal enrollment"
        description="Create and print a secure QR campaign for your front desk."
      >
        <Link
          href="/dashboard/settings/customer-portal"
          className="inline-flex rounded-lg bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]"
        >
          Open QR & print builder
        </Link>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="pricing-validity"
        tone="passive"
        title="Pricing validity"
        description="Controls how long menu pricing remains fresh before requiring review."
        action={
          <Button
            onClick={onSavePricingValidDays}
            disabled={
              !isUnlocked || pricingValidDaysLoading || pricingValidDaysSaving
            }
            size="sm"
          >
            {pricingValidDaysSaving ? "Saving..." : "Save pricing"}
          </Button>
        }
      >
        <div className="grid gap-3 text-sm md:grid-cols-[160px_1fr]">
          <Input
            type="number"
            min={1}
            max={90}
            value={String(pricingValidDays)}
            onChange={(e) => {
              const next = Number(e.target.value);
              onPricingValidDaysChange(Number.isFinite(next) ? next : 30);
            }}
            disabled={
              !isUnlocked || pricingValidDaysLoading || pricingValidDaysSaving
            }
          />
          <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-[11px] text-[color:var(--theme-text-secondary)]">
            Default is 30 days. Allowed range is 1 to 90 days.
          </div>
        </div>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="appearance-mode"
        tone="primary"
        title="Appearance mode"
        description="Select Dark, Light, or System mode as part of your shop branding profile."
      >
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["dark", "Dark"],
              ["light", "Light"],
              ["system", "System"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={appearanceMode === value ? "default" : "secondary"}
              size="sm"
              disabled={appearanceSaving}
              onClick={() => onAppearanceModeChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-[color:var(--theme-text-secondary,var(--theme-text-muted))]">
          {appearanceSaving
            ? "Saving appearance preference..."
            : "Preference persists per user and applies immediately."}
        </p>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="workflow-automation"
        tone="secondary"
        title="Workflow & automation"
        description="Operational rules and automatic behaviors for shop workflows."
      >
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm text-[color:var(--theme-text-primary)]">
            <input
              type="checkbox"
              checked={requireCauseCorrection}
              onChange={(e) => onRequireCauseCorrectionChange(e.target.checked)}
              disabled={!isUnlocked}
            />
            <span>
              <span className="block font-semibold">
                Require cause and correction
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--theme-text-muted)]">
                Technicians must document both fields before the line can be
                completed.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm text-[color:var(--theme-text-primary)]">
            <input
              type="checkbox"
              checked={requireAuthorization}
              onChange={(e) => onRequireAuthorizationChange(e.target.checked)}
              disabled={!isUnlocked}
            />
            <span>
              <span className="block font-semibold">
                Require customer authorization
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--theme-text-muted)]">
                Blocks approval-dependent work until authorization is recorded.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm text-[color:var(--theme-text-primary)]">
            <input
              type="checkbox"
              checked={autoGeneratePdf}
              onChange={(e) => onAutoGeneratePdfChange(e.target.checked)}
              disabled={!isUnlocked}
            />
            <span>
              <span className="block font-semibold">
                Generate quote PDFs automatically
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--theme-text-muted)]">
                Creates the customer-ready document when a quote is prepared.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm text-[color:var(--theme-text-primary)]">
            <input
              type="checkbox"
              checked={autoSendQuoteEmail}
              onChange={(e) => onAutoSendQuoteEmailChange(e.target.checked)}
              disabled={!isUnlocked}
            />
            <span>
              <span className="block font-semibold">
                Send quote email automatically
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--theme-text-muted)]">
                Emails the customer as soon as the quote is ready.
              </span>
            </span>
          </label>
        </div>
      </OwnerSettingsPanel>
    </div>
  );
}
