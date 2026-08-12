export const CUSTOMER_PRICING_PRECEDENCE = {
  manual_override: 1000,
  fleet_contract: 800,
  customer_contract: 800,
  customer_specific: 700,
  shop_default: 100,
} as const;

export type CustomerPricingSource = keyof typeof CUSTOMER_PRICING_PRECEDENCE;

export type CustomerPricingAgreement = {
  id: string;
  sourceType: Exclude<
    CustomerPricingSource,
    "manual_override" | "shop_default"
  >;
  status: "active" | "superseded" | "retired";
  currency: "CAD" | "USD";
  laborRate: number | null;
  laborDiscountPercent: number;
  partsDiscountPercent: number;
  partsMarkupMatrix?: PartsMarkupTier[];
  minimumPartsMarginPercent?: number;
  customerFeeType?: CustomerFeeType;
  customerFeeValue?: number;
  customerFeeCap?: number | null;
  expiryWarningDays?: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
};

export type PartsMarkupTier = {
  costFrom: number;
  costTo: number | null;
  markupPercent: number;
};

export type CustomerFeeType = "none" | "flat" | "percentage";

export type V2PartPricingResolution = {
  cost: number | null;
  baseUnitPrice: number;
  matrixMarkupPercent: number | null;
  matrixUnitPrice: number;
  discountPercent: number;
  discountedUnitPrice: number;
  minimumMarginPercent: number;
  marginFloorUnitPrice: number | null;
  resolvedUnitPrice: number;
  floorApplied: boolean;
  provenance: "matrix" | "base_sell";
};

export type ContractExpiryStatus =
  | "no_expiry"
  | "active"
  | "expiring_soon"
  | "expired";

export type ApprovedManualPricingOverride = {
  approved: boolean;
  approvedBy: string | null;
  reason: string | null;
  laborRate?: number | null;
  laborTotal?: number | null;
  partsTotal?: number | null;
};

export type CustomerPricingResolution = {
  sourceType: CustomerPricingSource;
  precedenceRank: number;
  agreementId: string | null;
  currency: "CAD" | "USD";
  baseLaborRate: number;
  resolvedLaborRate: number;
  baseLaborTotal: number;
  resolvedLaborTotal: number;
  basePartsTotal: number;
  resolvedPartsTotal: number;
  laborDiscountPercent: number;
  partsDiscountPercent: number;
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function boundedPercent(value: number): number {
  return Math.min(100, nonNegative(value));
}

export function validatePartsMarkupMatrix(
  tiers: PartsMarkupTier[],
): boolean {
  if (tiers.length > 50) return false;
  let previousUpper: number | null = null;
  return tiers.every((tier, index) => {
    const from = nonNegative(tier.costFrom);
    const to = tier.costTo == null ? null : nonNegative(tier.costTo);
    const valid =
      Number.isFinite(tier.costFrom) &&
      Number.isFinite(tier.markupPercent) &&
      tier.costFrom === from &&
      tier.markupPercent >= 0 &&
      tier.markupPercent <= 1000 &&
      (to == null || (Number.isFinite(tier.costTo) && to >= from)) &&
      (index === 0 ? from === 0 : previousUpper != null && from > previousUpper);
    previousUpper = to;
    return valid && (index === tiers.length - 1 || to != null);
  });
}

function matrixTierForCost(
  tiers: PartsMarkupTier[],
  cost: number,
): PartsMarkupTier | null {
  if (!validatePartsMarkupMatrix(tiers)) return null;
  return (
    tiers.find(
      (tier) =>
        cost >= tier.costFrom && (tier.costTo == null || cost <= tier.costTo),
    ) ?? null
  );
}

export function resolveV2PartPricing(input: {
  unitCost: number | null;
  baseUnitPrice: number;
  matrix: PartsMarkupTier[];
  partsDiscountPercent: number;
  minimumPartsMarginPercent: number;
}): V2PartPricingResolution {
  const cost =
    input.unitCost == null || !Number.isFinite(input.unitCost)
      ? null
      : money(nonNegative(input.unitCost));
  const baseUnitPrice = money(nonNegative(input.baseUnitPrice));
  const tier = cost == null ? null : matrixTierForCost(input.matrix, cost);
  const matrixUnitPrice = money(
    tier && cost != null
      ? cost * (1 + boundedPercent(tier.markupPercent) / 100)
      : baseUnitPrice,
  );
  const discountPercent = boundedPercent(input.partsDiscountPercent);
  const discountedUnitPrice = money(
    matrixUnitPrice * (1 - discountPercent / 100),
  );
  const minimumMarginPercent = Math.min(
    99.99,
    boundedPercent(input.minimumPartsMarginPercent),
  );
  const marginFloorUnitPrice =
    cost == null || minimumMarginPercent <= 0
      ? null
      : money(cost / (1 - minimumMarginPercent / 100));
  const resolvedUnitPrice = money(
    Math.max(discountedUnitPrice, marginFloorUnitPrice ?? 0),
  );

  return {
    cost,
    baseUnitPrice,
    matrixMarkupPercent: tier?.markupPercent ?? null,
    matrixUnitPrice,
    discountPercent,
    discountedUnitPrice,
    minimumMarginPercent,
    marginFloorUnitPrice,
    resolvedUnitPrice,
    floorApplied:
      marginFloorUnitPrice != null && marginFloorUnitPrice > discountedUnitPrice,
    provenance: tier ? "matrix" : "base_sell",
  };
}

export function resolveCustomerFee(input: {
  type: CustomerFeeType;
  value: number;
  cap?: number | null;
  laborAndPartsSubtotal: number;
}): number {
  const value = nonNegative(input.value);
  const subtotal = money(nonNegative(input.laborAndPartsSubtotal));
  const calculated =
    input.type === "flat"
      ? value
      : input.type === "percentage"
        ? subtotal * (boundedPercent(value) / 100)
        : 0;
  const cap =
    input.cap == null || !Number.isFinite(input.cap)
      ? null
      : nonNegative(input.cap);
  return money(cap == null ? calculated : Math.min(calculated, cap));
}

export function contractExpiryStatus(input: {
  effectiveUntil: string | null;
  at: string;
  warningDays: number;
}): ContractExpiryStatus {
  if (!input.effectiveUntil) return "no_expiry";
  const end = Date.parse(`${input.effectiveUntil.slice(0, 10)}T00:00:00Z`);
  const at = Date.parse(`${dateOnly(input.at)}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(at)) return "active";
  if (end < at) return "expired";
  const daysRemaining = Math.ceil((end - at) / 86_400_000);
  return daysRemaining <= Math.max(0, Math.floor(input.warningDays))
    ? "expiring_soon"
    : "active";
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function isEffective(agreement: CustomerPricingAgreement, at: string): boolean {
  const day = dateOnly(at);
  return (
    agreement.status === "active" &&
    agreement.effectiveFrom <= day &&
    (!agreement.effectiveUntil || agreement.effectiveUntil >= day)
  );
}

export function selectEffectiveCustomerPricingAgreement(input: {
  agreements: CustomerPricingAgreement[];
  at: string;
}): CustomerPricingAgreement | null {
  return (
    input.agreements
      .filter((agreement) => isEffective(agreement, input.at))
      .sort((left, right) => {
        const rankDelta =
          CUSTOMER_PRICING_PRECEDENCE[right.sourceType] -
          CUSTOMER_PRICING_PRECEDENCE[left.sourceType];
        if (rankDelta !== 0) return rankDelta;
        const effectiveDelta = right.effectiveFrom.localeCompare(
          left.effectiveFrom,
        );
        if (effectiveDelta !== 0) return effectiveDelta;
        const createdDelta = right.createdAt.localeCompare(left.createdAt);
        if (createdDelta !== 0) return createdDelta;
        return right.id.localeCompare(left.id);
      })[0] ?? null
  );
}

function isApprovedManualOverride(
  override: ApprovedManualPricingOverride | null | undefined,
): override is ApprovedManualPricingOverride {
  return Boolean(
    override?.approved &&
    override.approvedBy?.trim() &&
    override.reason?.trim(),
  );
}

export function resolveCustomerPricing(input: {
  agreements: CustomerPricingAgreement[];
  manualOverride?: ApprovedManualPricingOverride | null;
  at: string;
  currency: "CAD" | "USD";
  laborHours: number;
  baseLaborRate: number;
  basePartsTotal: number;
}): CustomerPricingResolution {
  const laborHours = nonNegative(input.laborHours);
  const baseLaborRate = money(nonNegative(input.baseLaborRate));
  const basePartsTotal = money(nonNegative(input.basePartsTotal));
  const baseLaborTotal = money(laborHours * baseLaborRate);

  if (isApprovedManualOverride(input.manualOverride)) {
    const resolvedLaborRate = money(
      nonNegative(input.manualOverride.laborRate ?? baseLaborRate),
    );
    const resolvedLaborTotal = money(
      nonNegative(
        input.manualOverride.laborTotal ?? laborHours * resolvedLaborRate,
      ),
    );
    const resolvedPartsTotal = money(
      nonNegative(input.manualOverride.partsTotal ?? basePartsTotal),
    );
    return {
      sourceType: "manual_override",
      precedenceRank: CUSTOMER_PRICING_PRECEDENCE.manual_override,
      agreementId: null,
      currency: input.currency,
      baseLaborRate,
      resolvedLaborRate,
      baseLaborTotal,
      resolvedLaborTotal,
      basePartsTotal,
      resolvedPartsTotal,
      laborDiscountPercent: 0,
      partsDiscountPercent: 0,
    };
  }

  const agreement = selectEffectiveCustomerPricingAgreement({
    agreements: input.agreements,
    at: input.at,
  });
  if (!agreement) {
    return {
      sourceType: "shop_default",
      precedenceRank: CUSTOMER_PRICING_PRECEDENCE.shop_default,
      agreementId: null,
      currency: input.currency,
      baseLaborRate,
      resolvedLaborRate: baseLaborRate,
      baseLaborTotal,
      resolvedLaborTotal: baseLaborTotal,
      basePartsTotal,
      resolvedPartsTotal: basePartsTotal,
      laborDiscountPercent: 0,
      partsDiscountPercent: 0,
    };
  }

  const laborDiscountPercent = nonNegative(agreement.laborDiscountPercent);
  const partsDiscountPercent = nonNegative(agreement.partsDiscountPercent);
  const resolvedLaborRate = money(
    agreement.laborRate == null
      ? baseLaborRate * (1 - laborDiscountPercent / 100)
      : nonNegative(agreement.laborRate),
  );

  return {
    sourceType: agreement.sourceType,
    precedenceRank: CUSTOMER_PRICING_PRECEDENCE[agreement.sourceType],
    agreementId: agreement.id,
    currency: agreement.currency,
    baseLaborRate,
    resolvedLaborRate,
    baseLaborTotal,
    resolvedLaborTotal: money(laborHours * resolvedLaborRate),
    basePartsTotal,
    resolvedPartsTotal: money(
      basePartsTotal * (1 - partsDiscountPercent / 100),
    ),
    laborDiscountPercent,
    partsDiscountPercent,
  };
}
