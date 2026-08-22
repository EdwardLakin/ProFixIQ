import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REGRESSION_FIXTURE,
  REGRESSION_FIXTURE_PASSWORD,
  REGRESSION_FIXTURE_TIMESTAMP,
  REGRESSION_FIXTURE_VERSION,
} from "./fixtures/regression/manifest";

const seed = readFileSync(
  resolve(process.cwd(), "supabase/fixtures/regression.sql"),
  "utf8",
);
const inertDefaultSeed = readFileSync(
  resolve(process.cwd(), "supabase/seed.sql"),
  "utf8",
);
const supabaseConfig = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);
const packageJson = readFileSync(
  resolve(process.cwd(), "package.json"),
  "utf8",
);
const packageScripts = (
  JSON.parse(packageJson) as { scripts?: Record<string, string> }
).scripts;

const ALLOWED_REGRESSION_MUTATION_TARGETS = [
  "auth.identities",
  "auth.users",
  "public.customers",
  "public.fleet_dispatch_assignments",
  "public.fleet_members",
  "public.fleet_pretrip_reports",
  "public.fleet_service_requests",
  "public.fleet_unit_defects",
  "public.fleet_vehicles",
  "public.fleets",
  "public.mobile_field_operators",
  "public.mobile_service_settings",
  "public.profiles",
  "public.scheduling_resources",
  "public.shop_members",
  "public.shops",
  "public.vehicles",
  "public.work_order_lines",
  "public.work_order_parts",
  "public.work_order_quote_lines",
  "public.work_orders",
] as const;

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function parseConfiguredSeedPaths(config: string): string[] {
  const lines = config.split(/\r?\n/);
  const sectionStart = lines.findIndex(
    (line) => line.trim() === "[db.seed]",
  );
  if (sectionStart === -1) return [];

  const sectionLines: string[] = [];
  for (const line of lines.slice(sectionStart + 1)) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) break;
    sectionLines.push(line);
  }

  const sqlPathsBody = sectionLines
    .join("\n")
    .match(/^\s*sql_paths\s*=\s*\[([\s\S]*?)\]/m)?.[1];
  if (!sqlPathsBody) return [];

  return [...sqlPathsBody.matchAll(/(["'])(.*?)\1/g)].map(
    (match) => match[2],
  );
}

function seedPatternIncludesRegressionFixture(pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  let expression = "^";

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    if (character === "*" && normalizedPattern[index + 1] === "*") {
      index += 1;
      if (normalizedPattern[index + 1] === "/") {
        index += 1;
        expression += "(?:.*/)?";
      } else {
        expression += ".*";
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }

  return new RegExp(`${expression}$`).test("fixtures/regression.sql");
}

describe("deterministic regression fixture contract", () => {
  it("names one Pro and one Starter tenant with stable selectors", () => {
    expect(REGRESSION_FIXTURE.shops.pro.plan).toBe("pro");
    expect(REGRESSION_FIXTURE.shops.starter.plan).toBe("starter");
    expect(REGRESSION_FIXTURE.shops.pro.id).not.toBe(
      REGRESSION_FIXTURE.shops.starter.id,
    );

    for (const shop of Object.values(REGRESSION_FIXTURE.shops)) {
      expect(seed).toContain(shop.id);
      expect(seed).toContain(shop.slug);
    }
  });

  it("locks every required actor to a database-verified identity/role/tenant tuple", () => {
    const personas = REGRESSION_FIXTURE.personas;
    expect(personas.proOwner.role).toBe("owner");
    expect(personas.manager.role).toBe("manager");
    expect(personas.advisor.role).toBe("advisor");
    expect(personas.technician.role).toBe("mechanic");
    expect(personas.leadTech.role).toBe("lead_hand");
    expect(personas.parts.role).toBe("parts");
    expect(personas.customer.role).toBe("customer");
    expect(personas.fleetManager.role).toBe("fleet_manager");
    expect(personas.dispatcher.role).toBe("dispatcher");
    expect(personas.driver.role).toBe("driver");
    expect(personas.fieldOperator.fieldEnabled).toBe(true);
    expect(personas.fieldDisabled.fieldEnabled).toBe(false);

    const ids = Object.values(personas).map((persona) => persona.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const persona of Object.values(personas)) {
      const shopId = persona.shop
        ? REGRESSION_FIXTURE.shops[persona.shop].id
        : null;
      const expectedTuple = shopId
        ? `('${persona.id}'::uuid, '${persona.email}', '${persona.role}', '${shopId}'::uuid)`
        : `('${persona.id}'::uuid, '${persona.email}', '${persona.role}', null)`;

      expect(persona.email.endsWith("@regression.profixiq.invalid")).toBe(true);
      expect(seed).toContain(persona.id);
      expect(seed).toContain(persona.email);
      expect(seed).toContain(expectedTuple);
    }
    expect(seed).toContain(
      "Regression fixture persona identity/role/tenant tuples are incomplete",
    );
  });

  it("anchors every resource by deterministic id instead of row order or session", () => {
    const fixtureStrings = collectStrings(REGRESSION_FIXTURE).filter((value) =>
      /^f[0-9a-f]{7}-[0-9a-f-]{27}$/i.test(value),
    );
    for (const id of fixtureStrings) expect(seed).toContain(id);

    expect(seed.toLowerCase()).not.toContain("limit 1");
    expect(seed.toLowerCase()).not.toContain("order by");
    expect(seed.toLowerCase()).not.toContain("auth.uid()");
    expect(seed).toContain(REGRESSION_FIXTURE_VERSION);
    expect(seed).toContain(REGRESSION_FIXTURE_TIMESTAMP.replace(".000Z", "Z"));
  });

  it("includes the authorized quote boundary and unrelated cross-tenant quote", () => {
    expect(seed).toContain(REGRESSION_FIXTURE.workOrders.authorized);
    expect(seed).toContain(REGRESSION_FIXTURE.workOrders.unrelated);
    expect(seed).toContain(REGRESSION_FIXTURE.quotes.authorized);
    expect(seed).toContain(REGRESSION_FIXTURE.quotes.unrelated);
    expect(seed).toContain(REGRESSION_FIXTURE.quotedPart);
    expect(seed).toContain("'quoted'");
    expect(seed).toContain("'approved', 'customer_approved', 'approved'");
    expect(seed).toContain("'sent', 'sent', null");
  });

  it("includes plural Fleet assets, requests, defects, and pre-trips", () => {
    expect(REGRESSION_FIXTURE.fleetRequests).toHaveLength(2);
    expect(REGRESSION_FIXTURE.pretrips).toHaveLength(2);
    expect(REGRESSION_FIXTURE.fleetDefects).toHaveLength(2);
    expect(REGRESSION_FIXTURE.dispatchAssignments).toHaveLength(2);
    expect(seed).toContain(REGRESSION_FIXTURE.vehicles.fleetAssetOne);
    expect(seed).toContain(REGRESSION_FIXTURE.vehicles.fleetAssetTwo);
  });

  it("rebuilds trigger-owned scheduler capacity while triggers are suppressed", () => {
    expect(Object.values(REGRESSION_FIXTURE.schedulingResources)).toHaveLength(
      6,
    );
    for (const id of Object.values(REGRESSION_FIXTURE.schedulingResources)) {
      expect(seed).toContain(id);
    }
    expect(seed).toContain("insert into public.scheduling_resources");
    expect(seed).toContain(REGRESSION_FIXTURE.personas.fieldOperator.id);
    expect(seed).toContain("Scheduler capacity fixtures are incomplete");
  });

  it("keeps predictable credentials outside every configured seed path", () => {
    const configuredSeedPaths = parseConfiguredSeedPaths(supabaseConfig);

    expect(configuredSeedPaths.length).toBeGreaterThan(0);
    expect(
      configuredSeedPaths.some(seedPatternIncludesRegressionFixture),
    ).toBe(false);
    expect(inertDefaultSeed).not.toContain(REGRESSION_FIXTURE_PASSWORD);
    expect(inertDefaultSeed.toLowerCase()).not.toMatch(/\binsert\s+into\b/);
    expect(packageScripts?.["fixtures:regression:recreate"]).toBe(
      "supabase db reset --local --sql-paths ./fixtures/regression.sql",
    );
  });

  it("is replay-safe and cannot emit real outbound work", () => {
    const mutationTargets = [
      ...seed.matchAll(/\b(?:insert into|update)\s+((?:auth|public)\.\w+)/gi),
    ].map((match) => match[1].toLowerCase());

    expect(seed).toContain("set session_replication_role = replica;");
    expect(seed).toContain("set session_replication_role = origin;");
    expect(seed).toContain("on conflict (id) do update");
    expect(seed).toContain("on conflict (shop_id, profile_id) do update");
    expect(seed).toContain("auto_send_quote_email");
    expect(seed).toContain("false, false, false");
    expect(seed).toContain(REGRESSION_FIXTURE_PASSWORD);
    expect(seed).not.toMatch(
      /sendgrid|twilio|stripe\.checkout|payment_intent/i,
    );
    expect(seed).not.toContain("parts_supplier_quote_requests");
    expect([...new Set(mutationTargets)].sort()).toEqual([
      ...ALLOWED_REGRESSION_MUTATION_TARGETS,
    ]);
  });

  it("never mutates the temporary live reproduction work order", () => {
    for (const workOrder of REGRESSION_FIXTURE.protectedLiveWorkOrders) {
      expect(seed).not.toContain(workOrder);
    }
    expect(seed.toLowerCase()).not.toMatch(/\b(delete|truncate)\b/);
  });
});
