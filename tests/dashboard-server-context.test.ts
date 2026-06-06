import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveDashboardServerContext } from "@/features/dashboard/server/dashboard-shell-data";

function createMockSupabase() {
  const calls: Array<Record<string, unknown>> = [];
  const profile = {
    completed_onboarding: true,
    email: "edwardlakin35@gmail.com",
    full_name: "Edward Lakin",
    role: "owner",
    shop_id: "e9e87cda-3cbe-4785-956f-e8d05fcde539",
  };
  const shop = {
    id: profile.shop_id,
    name: "Edward's Garage",
    shop_name: null,
    business_name: null,
  };

  function tableQuery(table: string) {
    const query = {
      select(columns: string) {
        calls.push({ table, method: "select", columns });
        return query;
      },
      eq(column: string, value: string) {
        calls.push({ table, method: "eq", column, value });
        return query;
      },
      limit(count: number) {
        calls.push({ table, method: "limit", count });
        return query;
      },
      async maybeSingle() {
        calls.push({ table, method: "maybeSingle" });
        return { data: table === "profiles" ? profile : shop, error: null };
      },
    };

    return query;
  }

  return {
    calls,
    supabase: {
      auth: {
        async getUser() {
          calls.push({ method: "auth.getUser" });
          return {
            data: {
              user: {
                id: "cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c",
                email: "edwardlakin35@gmail.com",
              },
            },
            error: null,
          };
        },
      },
      from(table: string) {
        calls.push({ method: "from", table });
        return tableQuery(table);
      },
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ method: "rpc", name, args });
        return { error: null };
      },
    },
  };
}

describe("dashboard server shop context", () => {
  it("resolves the dashboard actor from auth user + profiles.shop_id and loads that shop", async () => {
    const { supabase, calls } = createMockSupabase();

    const identity = await resolveDashboardServerContext(supabase as never);

    expect(identity).toMatchObject({
      userId: "cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c",
      email: "edwardlakin35@gmail.com",
      role: "owner",
      shopId: "e9e87cda-3cbe-4785-956f-e8d05fcde539",
      profileExists: true,
      shopLoaded: true,
    });
    expect(identity.shop?.id).toBe("e9e87cda-3cbe-4785-956f-e8d05fcde539");

    expect(calls).toContainEqual({
      table: "profiles",
      method: "select",
      columns: "completed_onboarding, email, full_name, role, shop_id",
    });
    expect(calls).toContainEqual({
      table: "profiles",
      method: "eq",
      column: "id",
      value: "cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c",
    });
    expect(calls).toContainEqual({
      method: "rpc",
      name: "set_current_shop_id",
      args: { p_shop_id: "e9e87cda-3cbe-4785-956f-e8d05fcde539" },
    });
    expect(calls).toContainEqual({
      table: "shops",
      method: "eq",
      column: "id",
      value: "e9e87cda-3cbe-4785-956f-e8d05fcde539",
    });
  });

  it("keeps middleware and dashboard resolver profile lookup semantics aligned", () => {
    const middlewareSource = readFileSync("middleware.ts", "utf8");
    const resolverSource = readFileSync(
      "features/dashboard/server/dashboard-shell-data.ts",
      "utf8",
    );

    expect(middlewareSource).toContain('.from("profiles")');
    expect(middlewareSource).toContain('.eq("id", user.id)');
    expect(middlewareSource).toContain(".limit(1)");
    expect(middlewareSource).toContain(".maybeSingle()");

    expect(resolverSource).toContain('.from("profiles")');
    expect(resolverSource).toContain('.eq("id", userId)');
    expect(resolverSource).toContain(".limit(1)");
    expect(resolverSource).toContain(".maybeSingle<DashboardProfile>()");
    expect(resolverSource).not.toContain("createServerComponentClient");
    expect(resolverSource).not.toContain("@supabase/auth-helpers-nextjs");
  });

  it("guards the dashboard payload against stale no-shop fallbacks when profiles.shop_id exists", () => {
    const payloadSource = readFileSync(
      "features/dashboard/server/getOperationsDashboardPayload.ts",
      "utf8",
    );
    const shellSource = readFileSync(
      "features/dashboard/server/dashboard-shell-data.ts",
      "utf8",
    );
    const appShellSource = readFileSync(
      "features/shared/components/AppShell.tsx",
      "utf8",
    );
    const roleSidebarSource = readFileSync(
      "features/shared/components/RoleSidebar.tsx",
      "utf8",
    );

    expect(payloadSource).toContain(
      "const supabase = createDashboardServerClient();",
    );
    expect(payloadSource).toContain(
      "const identity = await getDashboardIdentity(supabase);",
    );
    expect(payloadSource).toContain("if (!identity.shopId)");
    expect(payloadSource).toContain('.eq("shop_id", identity.shopId)');
    expect(shellSource).toContain("const shopId = profile?.shop_id ?? null;");
    expect(shellSource).toContain("shopIdUsed: shopId");
    expect(appShellSource).toContain("initialIdentity?.role ?? null");
    expect(roleSidebarSource).toContain("normalizeRole(initialRole)");
  });
});
