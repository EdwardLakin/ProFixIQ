import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commandModule = readFileSync(
  "features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest.ts",
  "utf8",
);
const syncModule = readFileSync(
  "features/operations/server/syncAppointmentPartsPreparation.ts",
  "utf8",
);
const cronRoute = readFileSync(
  "app/api/internal/appointment-parts-preparation/route.ts",
  "utf8",
);
const automationTypes = readFileSync("features/ai/automation/types.ts", "utf8");
const automationPolicy = readFileSync("features/ai/server/automationPolicy.ts", "utf8");
const vercelConfig = readFileSync("vercel.json", "utf8");
const migrationFiles = readdirSync("supabase/migrations");

describe("Phase 5 — first deterministic GREEN command (prepare_appointment_parts_request)", () => {
  it("uses a durable menu-repair identity lookup, not the unrelated menu_items domain", () => {
    expect(commandModule).toContain("findMenuRepairItemForWorkOrderLine(");
    expect(commandModule).not.toContain("line.menu_item_id");
  });

  it("requires the mapped menu repair item to be active", () => {
    expect(commandModule).toContain("menuRepairItem.is_active");
  });

  it("requires completed-work provenance, matching the manual reuse flow's own bar", () => {
    expect(commandModule).toContain("menuRepairItem.source_work_order_line_id");
    expect(commandModule).toContain("COMPLETED_REPAIR_SOURCE");
    expect(commandModule).toContain("COMPLETED_REPAIR_STATUSES");
  });

  it("requires vehicle compatibility via the canonical exact-YMM matcher, not a looser bespoke check", () => {
    expect(commandModule).toContain("matchesCompletedRepairVehicle(");
  });

  it("requires an exact parts mapping — fails closed on any unmatched required part", () => {
    expect(commandModule).toContain('readinessLine.status === "unmatched"');
    expect(commandModule).toContain(
      "A required part could not be matched unambiguously to the shop's parts catalog.",
    );
  });

  it("treats an ambiguous normalized part-number/SKU match as unmatched rather than picking one arbitrarily", () => {
    const readinessModule = readFileSync(
      "features/operations/server/appointmentPreparation/buildPartsReadiness.ts",
      "utf8",
    );
    expect(readinessModule).toContain("AMBIGUOUS");
  });

  it("requires the work order to trace back to an explicit, active booking", () => {
    expect(commandModule).toContain('.from("bookings")');
    expect(commandModule).toContain('.is("cancelled_at", null)');
  });

  it("has duplicate/idempotency protection, including a re-check immediately before the mutating call", () => {
    const partRequestChecks = commandModule.match(/\.from\("part_request_items"\)/g) ?? [];
    expect(partRequestChecks.length).toBeGreaterThanOrEqual(2);
  });

  it("creates only the internal request needed to start the existing Parts workflow", () => {
    expect(commandModule).toContain("create_part_request_with_items");
  });

  it("never selects a supplier or places a purchase order", () => {
    for (const source of [commandModule, syncModule, cronRoute]) {
      expect(source.toLowerCase()).not.toMatch(/purchase_order|supplier_quote|place_order/);
    }
  });

  it("never mutates a work order, work order line, approval, or invoice", () => {
    for (const source of [commandModule, syncModule]) {
      expect(source).not.toMatch(
        /\.from\(\s*["'](work_orders|work_order_lines|approvals|invoices)["']\)\s*\.\s*(insert|update|upsert|delete)/,
      );
    }
  });

  it("uses a capability distinct from parts_ordering, so it cannot silently redefine that capability's meaning", () => {
    expect(commandModule).toContain(
      'export const AUTOMATION_CAPABILITY = "appointment_parts_preparation" as const;',
    );
    expect(automationTypes).toContain('"appointment_parts_preparation"');
    expect(automationTypes).toContain("appointment_parts_preparation:");
  });

  it("always records shadow evidence via the shared AI automation telemetry", () => {
    expect(commandModule).toContain("recordAutomationEvidence(");
    expect(commandModule).toContain("capability: AUTOMATION_CAPABILITY");
    expect(commandModule).toContain('outcome: "observed"');
  });

  it("gates real execution on the shared per-shop AI automation policy, not a bespoke check", () => {
    expect(commandModule).toContain("isAiAutomaticExecutionEnabled(");
  });

  it("keeps the global kill switch off for this capability in this change — nothing can execute automatically yet, anywhere", () => {
    const block = automationPolicy.match(
      /AI_AUTOMATION_EXECUTION_AVAILABLE[\s\S]*?=\s*{[\s\S]*?};/,
    )?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/appointment_parts_preparation:\s*false/);
  });

  it("widens the ai_automation_* capability CHECK constraints additively (no existing value removed or renamed)", () => {
    const automationMigrations = migrationFiles.filter((name) =>
      name.toLowerCase().includes("ai_automation"),
    );
    expect(automationMigrations).toEqual(
      [
        "20260715090000_premier_ai_automation_readiness.sql",
        "20260914210000_ai_automation_appointment_parts_preparation_capability.sql",
      ].sort(),
    );
    const migration = readFileSync(
      `supabase/migrations/${automationMigrations.find((name) => name !== "20260715090000_premier_ai_automation_readiness.sql")}`,
      "utf8",
    );
    for (const existingCapability of [
      "appointment_intake",
      "customer_status_updates",
      "work_order_line_creation",
      "quote_preparation",
      "approval_request_delivery",
      "parts_ordering",
      "appointment_reminders",
      "advisor_follow_up",
      "invoice_preparation",
      "payment_collection",
    ]) {
      expect(migration).toContain(`'${existingCapability}'`);
    }
    expect(migration).toContain("'appointment_parts_preparation'");
    expect(migration).not.toMatch(/drop\s+column|drop\s+table/i);
  });

  it("reconciles the settings constraint without dropping technician-copilot capability values", () => {
    const reconciliation = readFileSync(
      "supabase/migrations/20260921022000_reconcile_appointment_parts_capability_constraint.sql",
      "utf8",
    );
    for (const capability of [
      "technician_copilot_text",
      "technician_copilot_documentation",
      "technician_copilot_voice",
      "appointment_parts_preparation",
    ]) {
      expect(reconciliation).toContain(`'${capability}'`);
    }
    expect(reconciliation).toContain(
      "^technician_copilot_(text|documentation|voice):",
    );
  });

  it("is authenticated as an internal cron route, not a user-facing one", () => {
    expect(cronRoute).toContain("requireInternalApiSecret");
    expect(cronRoute).toContain("INTERNAL_CRON_SECRET");
    expect(cronRoute).toContain("CRON_SECRET");
  });

  it("is scheduled hourly, offset from the other internal crons", () => {
    expect(vercelConfig).toMatch(
      /"path":\s*"\/api\/internal\/appointment-parts-preparation",\s*\n\s*"schedule":\s*"22 \* \* \* \*"/,
    );
  });

  it("bounds its sweep to a near-term active booking window, not an unbounded or open-ended scan", () => {
    expect(syncModule).toContain("BOOKING_LOOKBACK_MS");
    expect(syncModule).toContain("BOOKING_LOOKAHEAD_MS");
    expect(syncModule).toContain("EXCLUDED_BOOKING_STATUSES");
  });

  it("resolves parts readiness once per sweep across every candidate, not once per line", () => {
    expect(syncModule).toContain("buildPartsReadinessForMenuRepairItems(");
    // The single-line convenience wrapper (prepareAppointmentPartsRequest)
    // still calls it directly for tests/non-batched callers, but the sweep
    // itself must call it exactly once, outside any per-line loop.
    expect(syncModule).not.toMatch(/for \([\s\S]{0,200}buildPartsReadinessForMenuRepairItems/);
  });

  it("surfaces a dependency query failure as a sweep error rather than silent ineligibility", () => {
    expect(commandModule).toMatch(/throw new Error\(`Could not load work order line/);
    expect(commandModule).toMatch(/throw new Error\(`Could not load work order:/);
    expect(commandModule).toMatch(/throw new Error\(`Could not load booking:/);
  });
});
