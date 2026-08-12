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
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
};

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
