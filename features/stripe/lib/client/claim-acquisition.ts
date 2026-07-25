type SearchParamsReader = {
  get(name: string): string | null;
};

export type StripeAcquisitionClaimResult =
  | { required: false; linked: true }
  | { required: true; linked: true }
  | { required: true; linked: false };

export async function claimStripeAcquisitionAfterAuth(
  searchParams: SearchParamsReader,
): Promise<StripeAcquisitionClaimResult> {
  if (searchParams.get("flow")?.trim() !== "acquisition") {
    return { required: false, linked: true };
  }

  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return { required: true, linked: false };
  }

  try {
    const response = await fetch("/api/stripe/checkout/link-user", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return { required: true, linked: response.ok };
  } catch {
    return { required: true, linked: false };
  }
}
