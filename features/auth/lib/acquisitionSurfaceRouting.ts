import type { ProductAcquisitionSurface } from "@/features/stripe/lib/stripe/product-packages";

const ACQUISITION_HOME: Record<ProductAcquisitionSurface, string> = {
  shop: "/dashboard",
  field: "/mobile/service",
  // A new Fleet trial owner must create the first fleet relationship before
  // the explicit fleet-membership gate can release the Fleet portal.
  fleet: "/dashboard/owner/fleet-access",
};

export function acquisitionHomeHref(
  surface: ProductAcquisitionSurface,
): string {
  return ACQUISITION_HOME[surface];
}

export function acquisitionOnboardingHref(
  surface: ProductAcquisitionSurface,
): string {
  return `/onboarding?surface=${encodeURIComponent(surface)}`;
}
