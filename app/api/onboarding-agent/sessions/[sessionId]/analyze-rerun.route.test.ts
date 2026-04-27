import { beforeEach, describe, expect, it, vi } from "vitest";

const requireShopScopedApiAccess = vi.fn();
const createAdminSupabase = vi.fn();
const assertOnboardingSessionOwnership = vi.fn();
const analyzeOnboardingSession = vi.fn();

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase,
}));
vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership,
}));
vi.mock("@/features/onboarding-agent/server/analyzeOnboardingSession", async () => {
  const actual = await vi.importActual<any>("@/features/onboarding-agent/server/analyzeOnboardingSession");
  return {
    ...actual,
    analyzeOnboardingSession,
  };
});

function makeAdmin(params: { analyzedAt?: string | null; rowsParsedTotal?: number; rawRowCount?: number; fileCount?: number }) {
  return {
    from(table: string) {
      const query: any = {
        table,
        _head: false,
        select(_cols: string, options?: any) {
          this._head = Boolean(options?.head);
          return this;
        },
        eq() { return this; },
        maybeSingle() {
          if (table === "onboarding_sessions") {
            return Promise.resolve({
              data: {
                analyzed_at: params.analyzedAt ?? null,
                summary: { rowsParsedTotal: params.rowsParsedTotal ?? 0 },
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: any, reject: any) {
          if (table === "onboarding_raw_rows") {
            return Promise.resolve({ count: params.rawRowCount ?? 0, error: null }).then(resolve, reject);
          }
          if (table === "onboarding_files") {
            return Promise.resolve({ count: params.fileCount ?? 1, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

describe("onboarding analyze/rerun routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("/analyze returns 409 when staged analysis artifacts already exist", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: true, profile: { shop_id: "shop-1" } });
    createAdminSupabase.mockReturnValue(makeAdmin({ rawRowCount: 3 }));
    assertOnboardingSessionOwnership.mockResolvedValue(undefined);

    const { POST } = await import("./analyze/route");
    const response = await POST(new Request("http://localhost"), { params: Promise.resolve({ sessionId: "session-1" }) });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain("Use Rerun analysis");
    expect(analyzeOnboardingSession).not.toHaveBeenCalled();
  });

  it("/rerun succeeds from analysis_failed status path", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: true, profile: { shop_id: "shop-1" } });
    createAdminSupabase.mockReturnValue(makeAdmin({}));
    assertOnboardingSessionOwnership.mockResolvedValue(undefined);
    analyzeOnboardingSession.mockResolvedValue({
      mode: "deterministic_fallback",
      warning: null,
      planSummary: { files: 1 },
      sessionSummary: { rowsParsedTotal: 2 },
    });

    const { POST } = await import("./rerun/route");
    const response = await POST(new Request("http://localhost"), { params: Promise.resolve({ sessionId: "session-1" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(analyzeOnboardingSession).toHaveBeenCalledOnce();
  });
});
