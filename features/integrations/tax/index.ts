/**
 * Tax Engine Layer
 * - Canada: province-based GST/PST/HST rules
 * - US: rate-driven (state is informational; tax rate must be configured per shop/location)
 * - Other markets: rate-driven VAT/GST
 *
 * NOTE:
 * US sales tax varies by local jurisdiction. Do NOT hardcode state rates.
 * Use shop-configured rate (or customer/location-configured rate) and pass it in.
 */

export type CountryCode = "CA" | "US" | "VAT";

/** Canada provinces/territories */
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

/** US states + DC (informational only; tax rate must still be provided) */
export type USStateCode =
  | "AL"
  | "AK"
  | "AZ"
  | "AR"
  | "CA"
  | "CO"
  | "CT"
  | "DE"
  | "FL"
  | "GA"
  | "HI"
  | "ID"
  | "IL"
  | "IN"
  | "IA"
  | "KS"
  | "KY"
  | "LA"
  | "ME"
  | "MD"
  | "MA"
  | "MI"
  | "MN"
  | "MS"
  | "MO"
  | "MT"
  | "NE"
  | "NV"
  | "NH"
  | "NJ"
  | "NM"
  | "NY"
  | "NC"
  | "ND"
  | "OH"
  | "OK"
  | "OR"
  | "PA"
  | "RI"
  | "SC"
  | "SD"
  | "TN"
  | "TX"
  | "UT"
  | "VT"
  | "VA"
  | "WA"
  | "WV"
  | "WI"
  | "WY"
  | "DC";

export interface TaxLine {
  label: string;
  rate: number; // decimal, e.g. 0.05
  amount: number; // computed tax amount
}

export interface TaxResult {
  subtotal: number;
  taxes: TaxLine[];
  total: number;
}

/** Rate-driven tax context (US + VAT/GST markets). */
export type TaxContext =
  | { country: "CA"; province: ProvinceCode }
  | {
      country: "US";
      state: USStateCode;
      /**
       * Combined effective sales tax rate (state+local).
       * Example: 7.25% => 0.0725
       */
      rate: number;
      label?: string; // default: "Sales Tax"
    }
  | {
      country: "VAT";
      /**
       * VAT/GST rate.
       * Example: 20% => 0.2
       */
      rate: number;
      label?: string; // default: "VAT"
    };

// All tax components are optional so HST-only / GST-only provinces type-check.
const PROVINCE_TAXES: Record<ProvinceCode, { gst?: number; pst?: number; hst?: number }> = {
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

const PROVINCE_SET: ReadonlySet<string> = new Set(Object.keys(PROVINCE_TAXES));

export function isProvinceCode(v: string): v is ProvinceCode {
  return PROVINCE_SET.has(v);
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  if (rate < 0) return 0;
  // > 1 means 100%+ tax, probably a bug; clamp but don’t crash
  if (rate > 1) return 1;
  return rate;
}

function sumTaxLines(taxes: TaxLine[]): number {
  return taxes.reduce((acc, t) => acc + (Number.isFinite(t.amount) ? t.amount : 0), 0);
}

function buildRateTax(amount: number, rate: number, label: string): TaxResult {
  const r = clampRate(rate);
  const taxes: TaxLine[] = r > 0 ? [{ label, rate: r, amount: amount * r }] : [];
  const total = amount + sumTaxLines(taxes);
  return { subtotal: amount, taxes, total };
}

function buildCanadaTax(amount: number, province: ProvinceCode): TaxResult {
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
      taxes.push({ label: province === "QC" ? "QST" : "PST", rate: rules.pst, amount: pst });
    }
  }

  const total = amount + sumTaxLines(taxes);
  return { subtotal: amount, taxes, total };
}

/**
 * Backwards compatible signature:
 * - calculateTax(amount, "AB") => Canada province rules
 * New signature:
 * - calculateTax(amount, { country: "US", state: "CA", rate: 0.0725 })
 * - calculateTax(amount, { country: "VAT", rate: 0.2 })
 */
export function calculateTax(amount: number, province: ProvinceCode): TaxResult;
export function calculateTax(amount: number, ctx: TaxContext): TaxResult;
export function calculateTax(amount: number, arg: ProvinceCode | TaxContext): TaxResult {
  const base = Number.isFinite(amount) ? amount : 0;

  // old usage: ProvinceCode
  if (typeof arg === "string") {
    return buildCanadaTax(base, arg);
  }

  // new usage: TaxContext
  if (arg.country === "CA") {
    return buildCanadaTax(base, arg.province);
  }

  if (arg.country === "US") {
    return buildRateTax(base, arg.rate, (arg.label ?? "Sales Tax").trim() || "Sales Tax");
  }

  // VAT
  return buildRateTax(base, arg.rate, (arg.label ?? "VAT").trim() || "VAT");
}

/** Convenience helper if you only want the tax amount number. */
export function getTaxAmount(result: TaxResult): number {
  return sumTaxLines(result.taxes);
}