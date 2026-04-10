"use client";

import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { OwnerSettingsPanel } from "@/features/dashboard/components/owner-settings/OwnerSettingsPanels";

type Props = {
  isUnlocked: boolean;
  currency: string;
  taxLabel: string;
  laborRate: string;
  suppliesPercent: string;
  diagnosticFee: string;
  taxRate: string;
  pricingValidDays: number;
  pricingValidDaysLoading: boolean;
  pricingValidDaysSaving: boolean;
  useAi: boolean;
  requireCauseCorrection: boolean;
  requireAuthorization: boolean;
  autoGeneratePdf: boolean;
  autoSendQuoteEmail: boolean;
  appearanceMode: "dark" | "light" | "system";
  appearanceSaving: boolean;
  onLaborRateChange: (value: string) => void;
  onSuppliesPercentChange: (value: string) => void;
  onDiagnosticFeeChange: (value: string) => void;
  onTaxRateChange: (value: string) => void;
  onPricingValidDaysChange: (value: number) => void;
  onSavePricingValidDays: () => void;
  onUseAiChange: (value: boolean) => void;
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
  suppliesPercent,
  diagnosticFee,
  taxRate,
  pricingValidDays,
  pricingValidDaysLoading,
  pricingValidDaysSaving,
  useAi,
  requireCauseCorrection,
  requireAuthorization,
  autoGeneratePdf,
  autoSendQuoteEmail,
  appearanceMode,
  appearanceSaving,
  onLaborRateChange,
  onSuppliesPercentChange,
  onDiagnosticFeeChange,
  onTaxRateChange,
  onPricingValidDaysChange,
  onSavePricingValidDays,
  onUseAiChange,
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
          <Input
            value={laborRate}
            onChange={(e) => onLaborRateChange(e.target.value)}
            placeholder={`Labor rate (${currency}/hr)`}
            disabled={!isUnlocked}
          />
          <Input
            value={suppliesPercent}
            onChange={(e) => onSuppliesPercentChange(e.target.value)}
            placeholder="Shop supplies (%)"
            disabled={!isUnlocked}
          />
          <Input
            value={diagnosticFee}
            onChange={(e) => onDiagnosticFeeChange(e.target.value)}
            placeholder={`Diagnostic fee (${currency})`}
            disabled={!isUnlocked}
          />
          <Input
            value={taxRate}
            onChange={(e) => onTaxRateChange(e.target.value)}
            placeholder={taxLabel}
            disabled={!isUnlocked}
          />
        </div>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="pricing-validity"
        tone="passive"
        title="Pricing validity"
        description="Controls how long menu pricing remains fresh before requiring review."
        action={
          <Button
            onClick={onSavePricingValidDays}
            disabled={!isUnlocked || pricingValidDaysLoading || pricingValidDaysSaving}
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
            disabled={!isUnlocked || pricingValidDaysLoading || pricingValidDaysSaving}
          />
          <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-[11px] text-neutral-400">
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
          {([
            ["dark", "Dark"],
            ["light", "Light"],
            ["system", "System"],
          ] as const).map(([value, label]) => (
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
        <p className="text-[11px] text-[color:var(--theme-text-secondary,#94A3B8)]">
          {appearanceSaving ? "Saving appearance preference..." : "Preference persists per user and applies immediately."}
        </p>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="workflow-automation"
        tone="secondary"
        title="Workflow & automation"
        description="Operational rules and automatic behaviors for shop workflows."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={useAi} onChange={(e) => onUseAiChange(e.target.checked)} disabled={!isUnlocked} />
            Use AI features
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={requireCauseCorrection} onChange={(e) => onRequireCauseCorrectionChange(e.target.checked)} disabled={!isUnlocked} />
            Require cause / correction on lines
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={requireAuthorization} onChange={(e) => onRequireAuthorizationChange(e.target.checked)} disabled={!isUnlocked} />
            Require customer authorization
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={autoGeneratePdf} onChange={(e) => onAutoGeneratePdfChange(e.target.checked)} disabled={!isUnlocked} />
            Auto-generate quote PDF
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={autoSendQuoteEmail} onChange={(e) => onAutoSendQuoteEmailChange(e.target.checked)} disabled={!isUnlocked} />
            Auto-send quote email
          </label>
        </div>
      </OwnerSettingsPanel>
    </div>
  );
}
