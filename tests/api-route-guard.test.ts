import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const options = {
  envSecretName: "INTERNAL_CRON_SECRET",
  headerName: "x-internal-cron-secret",
  routeLabel: "internal/test",
} as const;

describe("requireInternalApiSecret", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.INTERNAL_CRON_SECRET;
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.INTERNAL_CRON_SECRET;
    delete process.env.CRON_SECRET;
  });

  it("accepts an explicitly configured bearer secret when the header secret is absent", async () => {
    process.env.CRON_SECRET = "vercel-cron-secret";
    const { requireInternalApiSecret } = await import(
      "../features/shared/lib/server/api-route-guard"
    );

    const result = requireInternalApiSecret({
      ...options,
      bearerEnvSecretName: "CRON_SECRET",
      request: new Request("https://example.test/api/internal/test", {
        headers: { authorization: "Bearer vercel-cron-secret" },
      }),
    });

    expect(result.ok).toBe(true);
  });

  it("remains fail-closed when neither configured credential can authorize the request", async () => {
    process.env.CRON_SECRET = "vercel-cron-secret";
    const { requireInternalApiSecret } = await import(
      "../features/shared/lib/server/api-route-guard"
    );

    const result = requireInternalApiSecret({
      ...options,
      bearerEnvSecretName: "CRON_SECRET",
      request: new Request("https://example.test/api/internal/test", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
  });

  it("preserves the existing internal header credential path", async () => {
    process.env.INTERNAL_CRON_SECRET = "internal-secret";
    const { requireInternalApiSecret } = await import(
      "../features/shared/lib/server/api-route-guard"
    );

    const result = requireInternalApiSecret({
      ...options,
      bearerEnvSecretName: "CRON_SECRET",
      request: new Request("https://example.test/api/internal/test", {
        headers: { "x-internal-cron-secret": "internal-secret" },
      }),
    });

    expect(result.ok).toBe(true);
  });
});
