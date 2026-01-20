//features/integrations/tax/index.ts

/**
 * Tax Engine Layer
 * Calculate taxes per province. No external providers yet.
 */

export type ProvinceCode =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NS"
  | "NT"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT";

export interface TaxLine {
  label: string;
  rate: number;   // decimal, e.g. 0.05
  amount: number; // computed tax amount
}

export interface TaxResult {
  subtotal: number;
  taxes: TaxLine[];
  total: number;
}

// All tax components are optional so HST-only / GST-only provinces type-check
const PROVINCE_TAXES: Record<
  ProvinceCode,
  { gst?: number; pst?: number; hst?: number }
> = {
  AB: { gst: 0.05 },
  BC: { gst: 0.05, pst: 0.07 },
  MB: { gst: 0.05, pst: 0.07 },
  NB: { hst: 0.15 },
  NL: { hst: 0.15 },
  NS: { hst: 0.15 },
  NT: { gst: 0.05 },
  NU: { gst: 0.05 },
  ON: { hst: 0.13 },
  PE: { hst: 0.15 },
  QC: { gst: 0.05, pst: 0.09975 }, // QST treated as PST here
  SK: { gst: 0.05, pst: 0.06 },
  YT: { gst: 0.05 },
};

export function calculateTax(
  amount: number,
  province: ProvinceCode
): TaxResult {
  const rules = PROVINCE_TAXES[province];
  const taxes: TaxLine[] = [];

  // HST provinces
  if (rules.hst !== undefined) {
    const hst = amount * rules.hst;
    taxes.push({ label: "HST", rate: rules.hst, amount: hst });
  } else {
    // GST (most provinces)
    if (rules.gst !== undefined) {
      const gst = amount * rules.gst;
      taxes.push({ label: "GST", rate: rules.gst, amount: gst });
    }

    // PST / QST (where applicable)
    if (rules.pst !== undefined) {
      const pst = amount * rules.pst;
      taxes.push({ label: "PST", rate: rules.pst, amount: pst });
    }
  }

  const total = amount + taxes.reduce((acc, t) => acc + t.amount, 0);

  return { subtotal: amount, taxes, total };
}