import {
  normalizeProductAcquisitionSurface,
  type ProductAcquisitionSurface,
} from "@/features/stripe/lib/stripe/product-packages";

type SearchParamsReader = {
  get(name: string): string | null;
};

export type StripeAcquisitionClaimResult =
  | { required: false; linked: true; surface: null }
  | {
      required: true;
      linked: true;
      surface: ProductAcquisitionSurface;
    }
  | { required: true; linked: false; surface: null };

export async function claimStripeAcquisitionAfterAuth(
  searchParams: SearchParamsReader,
): Promise<StripeAcquisitionClaimResult> {
  if (searchParams.get("flow")?.trim() !== "acquisition") {
    return { required: false, linked: true, surface: null };
  }

  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return { required: true, linked: false, surface: null };
  }

  try {
    const response = await fetch("/api/stripe/checkout/link-user", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const body = (await response.json().catch(() => null)) as {
      surface?: unknown;
    } | null;
    const surface = normalizeProductAcquisitionSurface(body?.surface);
    return response.ok && surface
      ? { required: true, linked: true, surface }
      : { required: true, linked: false, surface: null };
  } catch {
    return { required: true, linked: false, surface: null };
  }
}
