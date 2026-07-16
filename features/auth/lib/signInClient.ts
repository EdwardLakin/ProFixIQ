export type SignInSurface = "shop" | "mobile" | "customer" | "fleet";

export async function signInWithIdentifier(input: {
  identifier: string;
  password: string;
  surface: SignInSurface;
}): Promise<{ ok: true; destination: string } | { ok: false; error: string }> {
  const response = await fetch("/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; destination?: string; error?: string }
    | null;

  if (!response.ok || !payload?.ok || !payload.destination) {
    return {
      ok: false,
      error: payload?.error || "We couldn't sign you in. Please try again.",
    };
  }

  return { ok: true, destination: payload.destination };
}
