import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commandModule = readFileSync(
  "features/operations/server/appointmentWorkOrderStaging/stageAppointmentWorkOrderLines.ts",
  "utf8",
);
const syncModule = readFileSync(
  "features/operations/server/syncAppointmentWorkOrderStaging.ts",
  "utf8",
);
const cronRoute = readFileSync(
  "app/api/internal/appointment-work-order-staging/route.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260915100000_appointment_work_order_staging.sql",
  "utf8",
);
const vercelConfig = readFileSync("vercel.json", "utf8");
const automationTypes = readFileSync("features/ai/automation/types.ts", "utf8");

describe("Phase 6 — stage_appointment_work_order_lines, a narrowly scoped GREEN command", () => {
  it("never creates a real, punchable work order or work order line — only stages an internal, reviewable proposal", () => {
    expect(commandModule).not.toMatch(
      /\.from\(\s*["'](work_orders|work_order_lines)["']\)\s*\.\s*(insert|update|upsert)/,
    );
    expect(syncModule).not.toMatch(
      /\.from\(\s*["'](work_orders|work_order_lines)["']\)\s*\.\s*(insert|update|upsert)/,
    );
  });

  it("only ever writes to its own dedicated staging table", () => {
    expect(commandModule).toContain('.from("appointment_work_order_staging")');
    expect(commandModule).not.toMatch(
      /\.from\(\s*["'](?!appointment_work_order_staging)[a-z_]+["']\)\s*\.\s*(insert|update|upsert|delete)\(/,
    );
  });

  it("reuses the pre-provisioned work_order_line_creation automation capability rather than inventing a new one", () => {
    expect(commandModule).toContain(
      'export const AUTOMATION_CAPABILITY = "work_order_line_creation" as const;',
    );
    expect(automationTypes).toContain('"work_order_line_creation"');
  });

  it("always records shadow evidence before checking whether execution is enabled — the same GREEN rollout pattern as Phase 5's prepare_appointment_parts_request", () => {
    const fn = commandModule.slice(
      commandModule.indexOf("export async function finalizeAppointmentWorkOrderStaging"),
    );
    const evidenceIndex = fn.indexOf("recordAutomationEvidence(");
    const enabledCheckIndex = fn.indexOf("isAiAutomaticExecutionEnabled(");
    expect(evidenceIndex).toBeGreaterThan(-1);
    expect(enabledCheckIndex).toBeGreaterThan(evidenceIndex);
  });

  it("only stages a matched repair whose required parts are all ready — an exact, actionable mapping, not a guess", () => {
    expect(commandModule).toContain("requiredParts.some((line) => line.status !== \"ready\")");
    expect(commandModule).toContain("if (!item.isActive) continue;");
  });

  it("consumes the Phase 4 projection's already-computed matches — no independent menu-repair matching logic of its own", () => {
    expect(commandModule).not.toContain("findMenuRepairItemForWorkOrderLine");
    expect(syncModule).toContain('.from("appointment_preparations")');
    expect(syncModule).toContain('.select("booking_id, status, matched_menu_items")');
  });

  it("clears a stale staged proposal rather than leaving permanently orphaned data once a booking converts, cancels, or is no longer parts-ready", () => {
    expect(syncModule).toContain("clearAppointmentWorkOrderStaging(");
    expect(commandModule).toContain('.from("appointment_work_order_staging")\n    .delete()');
  });

  it("the staging table is locked to the service role at the table level, the same lockdown as appointment_preparations and shop_blocker_observations", () => {
    expect(migration).toContain(
      "revoke all on table public.appointment_work_order_staging from anon, authenticated;",
    );
    expect(migration).toContain(
      "grant all on table public.appointment_work_order_staging to service_role;",
    );
    expect(migration).toContain(
      "alter table public.appointment_work_order_staging enable row level security;",
    );
  });

  it("is authenticated as an internal cron route, not a user-facing one", () => {
    expect(cronRoute).toContain("requireInternalApiSecret");
    expect(cronRoute).toContain("INTERNAL_CRON_SECRET");
    expect(cronRoute).toContain("CRON_SECRET");
  });

  it("sweeps every shop on its own schedule, offset after the Phase 4/5 sweeps it depends on", () => {
    expect(cronRoute).toContain("fetchAllShopIds(");
    expect(vercelConfig).toMatch(
      /"path":\s*"\/api\/internal\/appointment-work-order-staging",\s*\n\s*"schedule":\s*"27 \* \* \* \*"/,
    );
  });

  it("the cron route always injects an admin client — appointment_preparations and appointment_work_order_staging are both service-role-only, so an interactive caller's client would throw a permission error", () => {
    expect(cronRoute).toContain("createAdminSupabase()");
    expect(cronRoute).toContain("syncAppointmentWorkOrderStaging({ supabase, shopId })");
  });
});
