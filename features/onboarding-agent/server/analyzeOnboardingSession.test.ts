import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingAnalysisConflictError, analyzeOnboardingSession } from "@/features/onboarding-agent/server/analyzeOnboardingSession";

vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/onboarding-agent/server/resetOnboardingAnalysisArtifacts", () => ({
  resetOnboardingAnalysisArtifacts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/onboarding-agent/server/buildOnboardingAgentInput", () => ({
  buildOnboardingAgentInput: vi.fn().mockResolvedValue({ files: [] }),
}));
vi.mock("@/features/onboarding-agent/server/runOpenAIOnboardingPlan", () => ({
  runOpenAIOnboardingPlan: vi.fn().mockResolvedValue({
    plan: {
      mode: "deterministic_fallback",
      summary: "ok",
      confidence: "high",
      activationReadiness: "not_ready",
      model: null,
      files: [],
    },
    warning: null,
  }),
}));
vi.mock("@/features/onboarding-agent/server/applyOnboardingAgentPlan", () => ({
  applyOnboardingAgentPlan: vi.fn().mockResolvedValue({ summary: { rowsParsedTotal: 2 } }),
}));

function createFakeSupabase() {
  const state = {
    status: "files_uploaded",
    rawRows: new Map<string, any>(),
    files: [
      {
        id: "file-1",
        storage_bucket: "bucket",
        storage_path: "seed.csv",
        original_filename: "seed.csv",
        declared_domain: "customer",
      },
    ],
    upsertCalls: [] as Array<{ rows: any[]; onConflict: string }>,
    touchedTables: [] as string[],
  };

  return {
    get status() {
      return state.status;
    },
    set status(next: string) {
      state.status = next;
    },
    rawRows: state.rawRows,
    files: state.files,
    upsertCalls: state.upsertCalls,
    touchedTables: state.touchedTables,
    storage: {
      from: () => ({
        download: async () => ({
          error: null,
          data: {
            text: async () => "name,email\\nJane,jane@example.com\\nJohn,john@example.com",
          },
        }),
      }),
    },
    from(table: string) {
      state.touchedTables.push(table);
      const query: any = {
      table,
      op: null,
      payload: null,
      filters: [] as Array<{ k: string; op: string; v: any }>,
      options: null as any,
      returning: null as string | null,
      select(cols: string) {
        this.returning = cols;
        if (!this.op) this.op = "select";
        return this;
      },
      update(payload: any) {
        this.op = "update";
        this.payload = payload;
        return this;
      },
      upsert(payload: any[], options: any) {
        this.op = "upsert";
        this.payload = payload;
        this.options = options;
        return this;
      },
      order() { return this; },
      delete() { this.op = "delete"; return this; },
      maybeSingle() {
        return this.execSingle();
      },
      eq(k: string, v: any) { this.filters.push({ k, op: "eq", v }); return this; },
      neq(k: string, v: any) { this.filters.push({ k, op: "neq", v }); return this; },
      then(resolve: any, reject: any) {
        return this.exec().then(resolve, reject);
      },
      async execSingle() {
        const result = await this.exec();
        const first = Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null;
        return { ...result, data: first };
      },
      async exec() {
        if (this.table === "onboarding_files" && this.op === "select") {
          return { data: state.files, error: null };
        }
        if (this.table === "onboarding_files" && this.op === "update") {
          return { data: [], error: null };
        }
        if (this.table === "onboarding_sessions" && this.op === "update") {
          const blocked = this.filters
            .filter((f: any) => f.op === "neq" && f.k === "status")
            .every((f: any) => state.status !== f.v);
          if (!blocked) return { data: [], error: null };
          if (typeof this.payload?.status === "string") state.status = this.payload.status;
          return { data: [{ id: "session-1", status: state.status }], error: null };
        }
        if (this.table === "onboarding_sessions" && this.op === "select") {
          return { data: [{ summary: {} }], error: null };
        }
        if (this.table === "onboarding_raw_rows" && this.op === "upsert") {
          state.upsertCalls.push({ rows: this.payload, onConflict: this.options?.onConflict });
          for (const row of this.payload) {
            const key = `${row.shop_id}:${row.file_id}:${row.source_row_index}`;
            state.rawRows.set(key, row);
          }
          return { data: [], error: null };
        }
        return { data: [], error: null };
      },
    };
    return query;
    },
  };
}

describe("analyzeOnboardingSession idempotent raw-row rebuild", () => {
  let sb: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    sb = createFakeSupabase();
  });

  it("upserts raw rows on shop_id,file_id,source_row_index and remains stable across reruns", async () => {
    sb.rawRows.set("shop-1:file-1:0", {
      shop_id: "shop-1",
      session_id: "old-session",
      file_id: "file-1",
      source_row_index: 0,
      raw: { name: "Old" },
    });

    await analyzeOnboardingSession({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1" });
    const firstRunCount = sb.rawRows.size;

    sb.status = "analysis_failed";
    await analyzeOnboardingSession({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1" });
    const secondRunCount = sb.rawRows.size;

    expect(firstRunCount).toBeGreaterThan(0);
    expect(secondRunCount).toBe(firstRunCount);
    expect(sb.upsertCalls.every((call) => call.onConflict === "shop_id,file_id,source_row_index")).toBe(true);
    expect(sb.upsertCalls.flatMap((call) => call.rows).every((row) => row.session_id === "session-1" && row.error_reason === null)).toBe(true);
    expect(sb.touchedTables.includes("suppliers")).toBe(false);
    expect(sb.touchedTables.includes("customers")).toBe(false);
    expect(sb.touchedTables.includes("vehicles")).toBe(false);
  });

  it("throws 409 conflict when a run is already in progress", async () => {
    sb.status = "analyzing";
    await expect(analyzeOnboardingSession({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1" })).rejects.toBeInstanceOf(OnboardingAnalysisConflictError);
    expect(sb.upsertCalls.length).toBe(0);
  });
});
