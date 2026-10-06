import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientKeyFromRequest,
  consumeRateLimit,
  enforcePublicRouteRateLimit,
} from "@/features/shared/lib/server/publicRouteRateLimit";
import {
  purgeOrphanDemoUploads,
  type PurgeClient,
} from "@/features/integrations/shopBoost/purgeOrphanDemoUploads";
import { recoverStaleRunningJobs } from "@/features/integrations/shopBoost/orchestrator";

const updateChain = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
  select: vi.fn(),
  attemptsUpdate: vi.fn(),
  attemptsIn: vi.fn(),
  attemptsEq: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => ({
      update: (values: unknown) => {
        if (table === "shop_onboarding_attempts") {
          updateChain.attemptsUpdate(values);
          return {
            in: (column: string, ids: string[]) => {
              updateChain.attemptsIn(column, ids);
              return {
                eq: async (eqColumn: string, value: unknown) => {
                  updateChain.attemptsEq(eqColumn, value);
                  return { error: null };
                },
              };
            },
          };
        }
        updateChain.update(values);
        return {
          eq: (column: string, value: unknown) => {
            updateChain.eq(column, value);
            return {
              lt: (ltColumn: string, ltValue: unknown) => {
                updateChain.lt(ltColumn, ltValue);
                return { select: async (columns: string) => updateChain.select(columns) };
              },
            };
          },
        };
      },
    }),
  }),
}));

function requestFrom(ip: string | null): Request {
  return new Request("https://www.profixiq.com/api/demo/shop-boost/uploads", {
    method: "POST",
    headers: ip ? { "x-forwarded-for": `${ip}, 10.0.0.1` } : {},
  });
}

describe("public route rate limiter", () => {
  it("allows up to max hits, then reports a retry-after", () => {
    const key = "unit-allow-then-block";
    const now = 1_000_000;

    expect(consumeRateLimit({ key, max: 2, windowMs: 60_000, now }).allowed).toBe(true);
    expect(consumeRateLimit({ key, max: 2, windowMs: 60_000, now: now + 1_000 }).allowed).toBe(true);

    const blocked = consumeRateLimit({ key, max: 2, windowMs: 60_000, now: now + 2_000 });
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 58 });
  });

  it("frees capacity once the window slides past the oldest hit", () => {
    const key = "unit-sliding-window";
    const now = 5_000_000;

    consumeRateLimit({ key, max: 1, windowMs: 10_000, now });
    expect(consumeRateLimit({ key, max: 1, windowMs: 10_000, now: now + 5_000 }).allowed).toBe(false);
    expect(consumeRateLimit({ key, max: 1, windowMs: 10_000, now: now + 10_001 }).allowed).toBe(true);
  });

  it("evicts least-recently-used keys once the tracked-key cap is exceeded", () => {
    const now = 9_000_000;
    consumeRateLimit({ key: "cap-first", max: 1, windowMs: 3_600_000, now });
    for (let i = 0; i < 5001; i += 1) {
      consumeRateLimit({ key: `cap-flood-${i}`, max: 1, windowMs: 3_600_000, now: now + 1 });
    }
    // The oldest key was evicted despite being inside its window, so it is allowed again.
    expect(consumeRateLimit({ key: "cap-first", max: 1, windowMs: 3_600_000, now: now + 2 }).allowed).toBe(true);
    // A recent key is still tracked and still limited.
    expect(consumeRateLimit({ key: "cap-flood-5000", max: 1, windowMs: 3_600_000, now: now + 2 }).allowed).toBe(false);
  });

  it("keys clients by the first forwarded address and ignores requests without one", () => {
    expect(clientKeyFromRequest(requestFrom("203.0.113.9"))).toBe("203.0.113.9");
    expect(clientKeyFromRequest(requestFrom(null))).toBeNull();
    expect(
      enforcePublicRouteRateLimit({ request: requestFrom(null), route: "unit-no-ip", max: 1, windowMs: 60_000 }),
    ).toBeNull();
  });

  it("returns a 429 with Retry-After once a client is over the limit", async () => {
    const args = { route: "unit-route-429", max: 1, windowMs: 60_000 };

    expect(enforcePublicRouteRateLimit({ request: requestFrom("198.51.100.4"), ...args })).toBeNull();
    const limited = enforcePublicRouteRateLimit({ request: requestFrom("198.51.100.4"), ...args });

    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await limited?.json()).toMatchObject({ ok: false });

    // A different client is unaffected.
    expect(enforcePublicRouteRateLimit({ request: requestFrom("198.51.100.5"), ...args })).toBeNull();
  });
});

describe("orphaned demo upload purge", () => {
  const DEMO_OLD = "11111111-1111-4111-8111-111111111111";
  const DEMO_ACTIVATED = "22222222-2222-4222-8222-222222222222";
  const INTAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const INTAKE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const NOW = Date.parse("2026-10-06T12:00:00.000Z");
  const OLD = "2026-09-01T00:00:00.000Z";
  const RECENT = "2026-10-05T00:00:00.000Z";

  const tree: Record<string, Array<{ name: string; id: string | null; created_at?: string }>> = {
    demos: [
      { name: DEMO_OLD, id: null },
      { name: DEMO_ACTIVATED, id: null },
      { name: "not-a-demo-folder", id: null },
    ],
    [`demos/${DEMO_OLD}`]: [{ name: INTAKE_A, id: null }],
    [`demos/${DEMO_OLD}/${INTAKE_A}`]: [
      { name: "customers-old.csv", id: "f1", created_at: OLD },
      { name: "vehicles-recent.csv", id: "f2", created_at: RECENT },
      { name: "notes-old.txt", id: "f3", created_at: OLD },
    ],
    [`demos/${DEMO_ACTIVATED}`]: [{ name: INTAKE_B, id: null }],
    [`demos/${DEMO_ACTIVATED}/${INTAKE_B}`]: [{ name: "customers-old.csv", id: "f4", created_at: OLD }],
  };

  const remove = vi.fn(async (_paths: string[]) => ({ error: null }));
  const list = vi.fn(async (path: string, options?: { offset?: number }) => ({
    data: (options?.offset ?? 0) === 0 ? (tree[path] ?? []) : [],
    error: null,
  }));
  const admin = {
    storage: { from: () => ({ list, remove }) },
    from: () => ({
      select: () => ({
        in: async () => ({ data: [{ id: DEMO_ACTIVATED, shop_id: "shop-1" }], error: null }),
      }),
    }),
  } as unknown as PurgeClient;

  beforeEach(() => {
    remove.mockClear();
    list.mockClear();
  });

  it("is a dry run unless apply is requested", async () => {
    const result = await purgeOrphanDemoUploads({ admin, apply: false, now: NOW });

    expect(result).toMatchObject({ dryRun: true, candidateFiles: 1, deletedFiles: 0, skippedActivatedDemos: 1 });
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes only old csv files of never-activated demos under demos/", async () => {
    const result = await purgeOrphanDemoUploads({ admin, apply: true, now: NOW });

    expect(result).toMatchObject({ dryRun: false, deletedFiles: 1, truncated: false });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([`demos/${DEMO_OLD}/${INTAKE_A}/customers-old.csv`]);
    expect(list).not.toHaveBeenCalledWith(expect.stringMatching(/^shops/), expect.anything());
  });
});

describe("orphaned demo upload purge paging", () => {
  const NOW = Date.parse("2026-10-06T12:00:00.000Z");
  const OLD = "2026-09-01T00:00:00.000Z";
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const INTAKE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("checks activation per page so activated demos cannot starve later pages", async () => {
    // Page 0: 100 activated demos. Page 1: one orphaned demo.
    const page0 = Array.from({ length: 100 }, (_, i) => ({ name: uuid(i + 1), id: null }));
    const orphan = uuid(500);
    const page1 = [{ name: orphan, id: null }];
    const activated = new Set(page0.map((entry) => entry.name));
    const list = vi.fn(async (path: string, options?: { offset?: number }) => {
      if (path === "demos") return { data: (options?.offset ?? 0) === 0 ? page0 : page1, error: null };
      const parts = path.split("/");
      if (parts.length === 2) return { data: [{ name: INTAKE, id: null }], error: null };
      return {
        data: Array.from({ length: 3 }, (_, i) => ({ name: `f${i}.csv`, id: `id${i}`, created_at: OLD })),
        error: null,
      };
    });
    const remove = vi.fn(async (_paths: string[]) => ({ error: null }));
    const admin = {
      storage: { from: () => ({ list, remove }) },
      from: () => ({
        select: () => ({
          in: async (_column: string, ids: string[]) => ({
            data: ids.map((id) => ({ id, shop_id: activated.has(id) ? "shop-1" : null })),
            error: null,
          }),
        }),
      }),
    } as unknown as PurgeClient;

    const result = await purgeOrphanDemoUploads({ admin, apply: true, now: NOW });

    expect(result.skippedActivatedDemos).toBe(100);
    expect(result.deletedFiles).toBe(3);
    expect(remove).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining(orphan)]));
    expect(result.nextPage).toBeNull();
  });
});

describe("stale shop boost job recovery", () => {
  beforeEach(() => {
    updateChain.update.mockClear();
    updateChain.eq.mockClear();
    updateChain.lt.mockClear();
    updateChain.select.mockReset();
    updateChain.attemptsUpdate.mockClear();
    updateChain.attemptsIn.mockClear();
    updateChain.attemptsEq.mockClear();
  });

  it("returns only long-locked running jobs to the retry queue", async () => {
    updateChain.select.mockReturnValue({ data: [{ id: "job-1" }, { id: "job-2" }], error: null });
    const now = new Date("2026-10-06T12:00:00.000Z");

    const result = await recoverStaleRunningJobs({ now, staleAfterMs: 15 * 60 * 1000 });

    expect(result).toEqual({ recovered: 2 });
    expect(updateChain.attemptsIn).toHaveBeenCalledWith("job_id", ["job-1", "job-2"]);
    expect(updateChain.attemptsEq).toHaveBeenCalledWith("status", "running");
    expect(updateChain.attemptsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error_code: "STALE_LOCK_RECOVERED" }),
    );
    expect(updateChain.eq).toHaveBeenCalledWith("status", "running");
    expect(updateChain.lt).toHaveBeenCalledWith("locked_at", "2026-10-06T11:45:00.000Z");
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "retryable_failed",
        error_code: "STALE_LOCK_RECOVERED",
        locked_at: null,
        locked_by: null,
      }),
    );
  });

  it("reports zero recovered when the update fails instead of throwing", async () => {
    updateChain.select.mockReturnValue({ data: null, error: { message: "boom" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(recoverStaleRunningJobs()).resolves.toEqual({ recovered: 0 });

    errorSpy.mockRestore();
  });
});
