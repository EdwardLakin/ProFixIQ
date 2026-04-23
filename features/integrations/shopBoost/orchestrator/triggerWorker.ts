type TriggerWorkerArgs = {
  shopId?: string;
  intakeId?: string;
  runId?: string;
  runImport?: boolean;
  maxRuns?: number;
  maxPasses?: number;
  triggerSource?: string;
};

type TriggerWorkerResponse = {
  ok: boolean;
  runsTouched?: number;
  jobsClaimed?: number;
};

function resolveInternalOrigin(): string | null {
  const explicit = process.env.INTERNAL_API_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (siteUrl) return siteUrl.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return null;
}

export async function triggerShopBoostWorker(args: TriggerWorkerArgs): Promise<{
  ok: boolean;
  statusCode?: number;
  response?: TriggerWorkerResponse;
  error?: string;
}> {
  const secret = process.env.SHOP_BOOST_SECRET?.trim();
  if (!secret) {
    return { ok: false, error: "SHOP_BOOST_SECRET not configured" };
  }

  const origin = resolveInternalOrigin();
  if (!origin) {
    return { ok: false, error: "No internal API origin configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${origin}/api/internal/shop-boost/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shop-boost-secret": secret,
      },
      body: JSON.stringify(args),
      signal: controller.signal,
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as TriggerWorkerResponse | null;
    if (!res.ok) {
      return {
        ok: false,
        statusCode: res.status,
        error: json && typeof json === "object" && "ok" in json ? "worker returned non-2xx" : "worker unavailable",
      };
    }

    return { ok: true, statusCode: res.status, response: json ?? { ok: true } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to trigger worker",
    };
  } finally {
    clearTimeout(timeout);
  }
}
