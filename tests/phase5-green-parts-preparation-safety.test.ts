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
const automationPolicy = readFileSync("features/ai/server/automationPolicy.ts", "utf8");
const vercelConfig = readFileSync("vercel.json", "utf8");
const migrationFiles = readdirSync("supabase/migrations");

describe("Phase 5 — first deterministic GREEN command (prepare_appointment_parts_request)", () => {
  it("requires an explicit, already-mapped menu repair item rather than guessing one", () => {
    expect(commandModule).toContain("line.menu_item_id");
    expect(commandModule).toContain(
      '"Line has no explicit menu-repair-item mapping."',
    );
  });

  it("requires the mapped menu repair item to be active", () => {
    expect(commandModule).toContain("menuRepairItem.is_active");
  });

  it("requires vehicle compatibility before proceeding", () => {
    expect(commandModule).toContain("isVehicleCompatibleWithMenuRepairItem(");
  });

  it("requires an exact parts mapping — fails closed on any unmatched required part", () => {
    expect(commandModule).toContain('readinessLine.status === "unmatched"');
    expect(commandModule).toContain(
      "A required part could not be matched to the shop's parts catalog.",
    );
  });

  it("requires the work order to trace back to an explicit, active booking", () => {
    expect(commandModule).toContain('.from("bookings")');
    expect(commandModule).toContain('.is("cancelled_at", null)');
  });

  it("has duplicate/idempotency protection: never requests parts twice for the same line", () => {
    expect(commandModule).toContain('.from("part_request_items")');
    expect(commandModule).toContain("A parts request already exists for this line.");
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

  it("always records shadow evidence via the shared AI automation telemetry, using the 'parts_ordering' capability", () => {
    expect(commandModule).toContain("recordAutomationEvidence(");
    expect(commandModule).toContain('capability: AUTOMATION_CAPABILITY');
    expect(commandModule).toContain('"parts_ordering"');
    expect(commandModule).toContain('outcome: "observed"');
  });

  it("gates real execution on the shared per-shop AI automation policy, not a bespoke check", () => {
    expect(commandModule).toContain("isAiAutomaticExecutionEnabled(");
  });

  it("keeps the global kill switch off for this capability in this change — nothing can execute automatically yet, anywhere", () => {
    // AI_AUTOMATION_EXECUTION_AVAILABLE is the master switch every shop's
    // effective-enabled computation depends on (features/ai/server/
    // automationPolicy.ts). Phase 5 ships the real command wired into the
    // evidence/readiness framework, but leaves this false so no shop can go
    // live from this change alone - flipping it is a deliberate, separate,
    // future step once real shadow evidence has been reviewed.
    const block = automationPolicy.match(
      /AI_AUTOMATION_EXECUTION_AVAILABLE[\s\S]*?=\s*{[\s\S]*?};/,
    )?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/parts_ordering:\s*false/);
  });

  it("does not add or alter any ai_automation_* migration — it only reuses the existing 'parts_ordering' capability value", () => {
    const automationMigrations = migrationFiles.filter((name) =>
      name.toLowerCase().includes("ai_automation"),
    );
    expect(automationMigrations).toEqual(["20260715090000_premier_ai_automation_readiness.sql"]);
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

  it("bounds its sweep to recent booking-linked work orders instead of scanning the whole historical table", () => {
    expect(syncModule).toContain("BOOKING_LOOKBACK_MS");
    expect(syncModule).toContain(".not(\"work_order_id\", \"is\", null)");
  });
});
