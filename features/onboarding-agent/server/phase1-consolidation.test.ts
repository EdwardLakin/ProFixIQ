import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOnboardingActivationPlan } from "@/features/onboarding-agent/server/buildOnboardingActivationPlan";
import { getOnboardingSession } from "@/features/onboarding-agent/server/getOnboardingSession";
import { ONBOARDING_SESSION_ALLOWED_STATUSES } from "@/features/onboarding-agent/lib/sessionStatus";

function createOnboardingSbMock() {
  const tables: string[] = [];
  const entities = Array.from({ length: 1205 }, (_, idx) => ({
    id: `entity-${idx}`,
    shop_id: "shop-1",
    session_id: "session-1",
    entity_type: idx % 2 === 0 ? "customer" : "vehicle",
    status: idx % 3 === 0 ? "ready" : "needs_review",
  }));
  const links = Array.from({ length: 1301 }, (_, idx) => ({
    id: `link-${idx}`,
    shop_id: "shop-1",
    session_id: "session-1",
    link_type: idx % 2 === 0 ? "customer_vehicle" : "vehicle_work_order",
    status: idx % 5 === 0 ? "needs_review" : "staged",
  }));
  const reviews = Array.from({ length: 1402 }, (_, idx) => ({
    id: `review-${idx}`,
    shop_id: "shop-1",
    session_id: "session-1",
    severity: idx % 2 === 0 ? "high" : "low",
    status: "pending",
    domain: idx % 2 === 0 ? "customers" : "vehicles",
    issue_type: idx % 2 === 0 ? "duplicate" : "missing_link",
    summary: `Issue ${idx}`,
    details: { sourceRowIndex: idx },
    created_at: new Date(Date.now() - idx * 1000).toISOString(),
  }));
  const files = [{ id: "file-1", shop_id: "shop-1", session_id: "session-1", row_count: 19717 }];

  const rowsByTable: Record<string, any[]> = {
    onboarding_entities: entities,
    onboarding_entity_links: links,
    onboarding_review_items: reviews,
    onboarding_files: files,
  };

  const applyFilters = (rows: any[], filters: Record<string, unknown>, orFilter?: string | null) => {
    let next = rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
    if (orFilter === "status.is.null,status.eq.pending") {
      next = next.filter((row) => row.status == null || row.status === "pending");
    }
    return next;
  };

  const sb = {
    from(table: string) {
      tables.push(table);
      const state: {
        filters: Record<string, unknown>;
        orderBy?: string;
        ascending: boolean;
        rangeFrom?: number;
        rangeTo?: number;
        orFilter?: string;
        wantCount: boolean;
        headOnly: boolean;
      } = {
        filters: {},
        ascending: true,
        wantCount: false,
        headOnly: false,
      };

      const buildResult = () => {
        if (table === "onboarding_sessions") {
          return { data: { id: "session-1", summary: {}, analyzed_at: new Date().toISOString() }, error: null, count: null };
        }
        if (table === "onboarding_activation_plans") {
          return { data: { id: "plan-1", status: "ready", summary: {}, created_at: new Date().toISOString() }, error: null, count: null };
        }

        const rows = applyFilters(rowsByTable[table] ?? [], state.filters, state.orFilter);
        const count = state.wantCount ? rows.length : null;
        if (state.headOnly) return { data: null, error: null, count };

        let ordered = [...rows];
        if (state.orderBy) {
          ordered.sort((a, b) => {
            const av = a[state.orderBy!];
            const bv = b[state.orderBy!];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            return av > bv ? 1 : -1;
          });
          if (!state.ascending) ordered.reverse();
        }
        if (typeof state.rangeFrom === "number" && typeof state.rangeTo === "number") {
          ordered = ordered.slice(state.rangeFrom, state.rangeTo + 1);
        }
        return { data: ordered, error: null, count };
      };

      const query: any = {
        select(_columns?: string, options?: { count?: string; head?: boolean }) {
          state.wantCount = options?.count === "exact";
          state.headOnly = options?.head === true;
          return query;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return query;
        },
        or(value: string) {
          state.orFilter = value;
          return query;
        },
        order(column: string, options?: { ascending?: boolean }) {
          state.orderBy = column;
          state.ascending = options?.ascending ?? true;
          return query;
        },
        range(from: number, to: number) {
          state.rangeFrom = from;
          state.rangeTo = to;
          return Promise.resolve(buildResult());
        },
        limit() { return query; },
        maybeSingle() { return Promise.resolve(buildResult()); },
        single() { return Promise.resolve(buildResult()); },
        insert() { return query; },
        update() { return query; },
        then(resolveFn: (value: any) => unknown, rejectFn?: (reason?: unknown) => unknown) {
          return Promise.resolve(buildResult()).then(resolveFn, rejectFn);
        },
      };
      return query;
    },
  };

  return { sb, tables, entities, links, reviews };
}

describe("onboarding phase 1 consolidation", () => {
  it("dashboard rerun and session rerun share canonical route helper usage", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "features/onboarding-agent/components/OnboardingAgentDashboard.tsx"), "utf8");
    const sessionPage = readFileSync(resolve(process.cwd(), "features/onboarding-agent/components/OnboardingSessionPage.tsx"), "utf8");

    expect(dashboard).toContain('onboardingSessionActionPath(sessionId, "rerun")');
    expect(sessionPage).toContain("onboardingSessionActionPath(sessionId, mode)");
  });

  it("activation preview reads staged onboarding artifacts only", async () => {
    const { sb, tables } = createOnboardingSbMock();

    await buildOnboardingActivationPlan({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1" });

    const nonOnboardingReads = tables.filter((table) => !table.startsWith("onboarding_"));
    expect(nonOnboardingReads).toEqual([]);
  });

  it("getOnboardingSession counts entities/links/reviews beyond 1000 persisted rows", async () => {
    const { sb, entities, links, reviews } = createOnboardingSbMock();
    const session = await getOnboardingSession({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1" });

    expect(session.summaryCounts.entitiesDiscovered).toBe(entities.length);
    expect(session.summaryCounts.linksFound).toBe(links.length);
    expect(session.summaryCounts.reviewExceptions).toBe(reviews.length);
    expect(session.entityCounts.customer + session.entityCounts.vehicle).toBe(entities.length);
    expect(session.linkCounts.customer_vehicle + session.linkCounts.vehicle_work_order).toBe(links.length);
    expect(
      Object.values(session.reviewCounts.byDomain ?? {}).reduce((sum, value) => sum + Number(value ?? 0), 0),
    ).toBe(reviews.length + session.entityStatusCounts.customer.needs_review + session.entityStatusCounts.vehicle.needs_review);
  });

  it("activation preview uses full persisted counts beyond first 1000 rows", async () => {
    const { sb, entities, links, reviews } = createOnboardingSbMock();
    const result = await buildOnboardingActivationPlan({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1" });

    expect((result.plan as any).entitiesDiscovered).toBe(entities.length);
    expect((result.plan as any).linksFound).toBe(links.length);
    expect((result.plan as any).reviewExceptions).toBe(reviews.length);
    expect(result.plan.reviewNeeded).toBeGreaterThan(1000);
  });

  it("status helper and SQL migration stay aligned", () => {
    const sql = readFileSync(resolve(process.cwd(), "db/sql/2026-04-27_onboarding_agent_phase1_consolidation.sql"), "utf8");
    for (const status of ONBOARDING_SESSION_ALLOWED_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it("analyze/rerun server pipeline does not reference live canonical write tables", () => {
    const analyzeSource = readFileSync(resolve(process.cwd(), "features/onboarding-agent/server/analyzeOnboardingSession.ts"), "utf8");
    const applySource = readFileSync(resolve(process.cwd(), "features/onboarding-agent/server/applyOnboardingAgentPlan.ts"), "utf8");
    const combined = `${analyzeSource}\n${applySource}`;

    const disallowedTables = ["customers", "vehicles", "work_orders", "invoices", "parts", "vendors", "staff", "menu", "inspections"];
    for (const table of disallowedTables) {
      expect(combined).not.toContain(`from(\"${table}\")`);
      expect(combined).not.toContain(`into ${table}`);
    }
  });
});
