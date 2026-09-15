import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commandModule = readFileSync(
  "features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest.ts",
  "utf8",
);
const notificationReader = readFileSync(
  "features/agent/server/syncAssistantNotifications.ts",
  "utf8",
);
const shopStateModule = readFileSync(
  "features/shop-assistant/server/state/buildShopState.ts",
  "utf8",
);

describe("Phase 6 — internal notification for an AI-prepared parts request", () => {
  it("stamps a stable, machine-checkable marker on every automated request's notes", () => {
    expect(commandModule).toContain(
      "export const AUTOMATED_PART_REQUEST_NOTES_MARKER",
    );
    expect(commandModule).toContain(
      "p_notes: `${AUTOMATED_PART_REQUEST_NOTES_MARKER}",
    );
  });

  it("identifies automated requests durably — marker plus a null requested_by — without a new column, trigger, or migration on the shared part_requests table", () => {
    const fn = notificationReader.slice(
      notificationReader.indexOf(
        "async function getDurableAutomatedPartsRequestNotifications",
      ),
      notificationReader.indexOf(
        "// Two independent surfaces on the same page",
      ),
    );
    expect(fn).toContain('.from("part_requests")');
    expect(fn).toContain('.is("requested_by", null)');
    expect(fn).toContain(
      '.ilike("notes", `${AUTOMATED_PART_REQUEST_NOTES_MARKER}%`)',
    );
    expect(fn).toContain(".range(");
    expect(fn).not.toContain(".limit(");
    expect(fn).not.toMatch(
      /\.from\(\s*["'](part_requests|assistant_notifications)["']\)\s*\.\s*(insert|update|upsert|delete)/,
    );
  });

  it("is computed only for the roles that already see the manual parts-pick signal", () => {
    expect(notificationReader).toContain(
      "const durableAutomatedPartsRequestNotifications = canSeePartsWorkflow",
    );
    expect(notificationReader).toContain(
      "getDurableAutomatedPartsRequestNotifications({ shopId })",
    );
  });

  it("merges into the same durable-notification path as the parts-pick signal, preserving acknowledgement state across recomputation", () => {
    const mergeBlock = notificationReader.slice(
      notificationReader.indexOf("for (const durable of ["),
      notificationReader.indexOf("return Array.from(merged.values())"),
    );
    expect(mergeBlock).toContain("durablePartsPickNotifications");
    expect(mergeBlock).toContain("durableAutomatedPartsRequestNotifications");
    expect(mergeBlock).toContain('persisted.status === "acknowledged"');
  });

  it("imports the capability identity from Phase 5's own module rather than duplicating the marker string", () => {
    expect(notificationReader).toContain(
      "AUTOMATED_PART_REQUEST_NOTES_MARKER,\n  AUTOMATION_CAPABILITY as APPOINTMENT_PARTS_PREPARATION_CAPABILITY,",
    );
    expect(notificationReader).toContain(
      '"@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"',
    );
  });

  it("never claims execution the shop hasn't been enabled for and never orders parts itself", () => {
    const fn = notificationReader.slice(
      notificationReader.indexOf(
        "async function getDurableAutomatedPartsRequestNotifications",
      ),
      notificationReader.indexOf(
        "// Two independent surfaces on the same page",
      ),
    );
    expect(fn.toLowerCase()).not.toMatch(
      /purchase_order|supplier_quote|place_order/,
    );
  });

  it("is visible to the parts-workflow role in the shop-assistant alert surface, not silently dropped by the default work-order gate", () => {
    expect(shopStateModule).toContain(
      'alert.code === "parts_delivery_overdue" ||\n    alert.code === "ai_parts_request_prepared"',
    );
  });

  it("carries the entity identity a reviewer needs to act on it", () => {
    const fn = notificationReader.slice(
      notificationReader.indexOf(
        "async function getDurableAutomatedPartsRequestNotifications",
      ),
      notificationReader.indexOf(
        "// Two independent surfaces on the same page",
      ),
    );
    expect(fn).toContain('entity_type: "part_request"');
    expect(fn).toContain("entity_id: request.id");
    expect(fn).toContain("href: `/parts/requests/${request.id}`");
    expect(fn).toContain("workOrderId: request.work_order_id");
    expect(fn).toContain("workOrderLineId: request.job_id");
  });
});
