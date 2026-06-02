import type { Json } from "@shared/types/types/supabase";

export type ShopSuppliesType = "percentage" | "flat";

export type ShopSuppliesSettings = {
  enabled: boolean;
  type: ShopSuppliesType;
  percent: number | null;
  flatAmount: number | null;
  capAmount: number | null;
};

export type ShopSuppliesOverride = {
  enabled: boolean | null;
  amount: number | null;
};

export type ShopSuppliesCalculation = {
  enabled: boolean;
  type: ShopSuppliesType;
  percent: number | null;
  flatAmount: number | null;
  capAmount: number | null;
  amount: number;
  taxableAmount: number;
  baseAmount: number;
  isOverrideAmount: boolean;
};

type ShopSuppliesShop = {
  shop_supplies_enabled?: unknown;
  shop_supplies_type?: unknown;
  shop_supplies_percent?: unknown;
  shop_supplies_flat_amount?: unknown;
  shop_supplies_cap_amount?: unknown;
  supplies_percent?: unknown;
};

type ShopSuppliesWorkOrder = {
  shop_supplies_enabled_override?: unknown;
  shop_supplies_amount_override?: unknown;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed == null ? null : Math.max(0, parsed);
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeType(value: unknown): ShopSuppliesType {
  return String(value ?? "").trim().toLowerCase() === "flat" ? "flat" : "percentage";
}

export function resolveShopSuppliesSettings(shop: ShopSuppliesShop | null | undefined): ShopSuppliesSettings {
  const legacyPercent = nonNegativeNumber(shop?.supplies_percent);
  const percent = nonNegativeNumber(shop?.shop_supplies_percent) ?? legacyPercent;
  const flatAmount = nonNegativeNumber(shop?.shop_supplies_flat_amount);
  const capAmount = nonNegativeNumber(shop?.shop_supplies_cap_amount);
  const type = normalizeType(shop?.shop_supplies_type);
  const explicitEnabled = booleanOrNull(shop?.shop_supplies_enabled);
  const enabled = explicitEnabled ?? Boolean((type === "flat" ? flatAmount : percent) && (type === "flat" ? flatAmount : percent)! > 0);

  return {
    enabled,
    type,
    percent,
    flatAmount,
    capAmount,
  };
}

export function resolveShopSuppliesOverride(workOrder: ShopSuppliesWorkOrder | null | undefined): ShopSuppliesOverride {
  return {
    enabled: booleanOrNull(workOrder?.shop_supplies_enabled_override),
    amount: nonNegativeNumber(workOrder?.shop_supplies_amount_override),
  };
}

export function calculateShopSupplies(params: {
  baseAmount: number;
  settings: ShopSuppliesSettings;
  override?: ShopSuppliesOverride | null;
}): ShopSuppliesCalculation {
  const baseAmount = Math.max(0, finiteNumber(params.baseAmount) ?? 0);
  const override = params.override ?? null;
  const enabled = override?.enabled ?? params.settings.enabled;
  const type = params.settings.type;
  let amount = 0;
  let isOverrideAmount = false;

  if (enabled) {
    if (override?.amount != null) {
      amount = override.amount;
      isOverrideAmount = true;
    } else if (type === "flat") {
      amount = params.settings.flatAmount ?? 0;
    } else {
      amount = baseAmount * ((params.settings.percent ?? 0) / 100);
    }
  }

  if (!isOverrideAmount && params.settings.capAmount != null) {
    amount = Math.min(amount, params.settings.capAmount);
  }

  return {
    enabled,
    type,
    percent: params.settings.percent,
    flatAmount: params.settings.flatAmount,
    capAmount: params.settings.capAmount,
    amount: Math.max(0, roundMoney(amount)),
    taxableAmount: Math.max(0, roundMoney(amount)),
    baseAmount,
    isOverrideAmount,
  };
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function shopSuppliesTaxableSubtotal(calc: ShopSuppliesCalculation): number {
  return calc.taxableAmount;
}

export function shopSuppliesSummaryText(calc: ShopSuppliesCalculation): string {
  if (!calc.enabled) return "Disabled for this work order";
  if (calc.isOverrideAmount) return "Advisor override";
  if (calc.type === "flat") return "Flat shop supplies";
  const pct = calc.percent ?? 0;
  const cap = calc.capAmount != null ? `, capped at ${roundMoney(calc.capAmount).toFixed(2)}` : "";
  return `${pct}% of labor + parts${cap}`;
}

export function shopSuppliesMetadata(calc: ShopSuppliesCalculation): Json {
  return {
    enabled: calc.enabled,
    type: calc.type,
    percent: calc.percent,
    flat_amount: calc.flatAmount,
    cap_amount: calc.capAmount,
    amount: calc.amount,
    taxable_amount: calc.taxableAmount,
    base_amount: calc.baseAmount,
    override_amount: calc.isOverrideAmount,
  } as Json;
}
