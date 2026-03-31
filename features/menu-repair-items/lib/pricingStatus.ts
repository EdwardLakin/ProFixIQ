export type PricingStatus = "fresh" | "stale" | "expired";

export function pricingStatusText(status: PricingStatus | null | undefined): string {
  if (status === "fresh") return "Fresh pricing";
  if (status === "stale") return "Stale pricing";
  return "Expired pricing";
}

export function pricingStatusClass(status: PricingStatus | null | undefined): string {
  if (status === "fresh") {
    return "border-emerald-500/30 bg-emerald-950/20 text-emerald-200";
  }
  if (status === "stale") {
    return "border-amber-500/30 bg-amber-950/20 text-amber-200";
  }
  return "border-red-500/30 bg-red-950/20 text-red-200";
}
