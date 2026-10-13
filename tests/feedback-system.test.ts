import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  feedbackStatusFromLegacy,
  inferFeedbackSurface,
  legacyStatusForFeedback,
} from "@/features/feedback/lib/feedback";

const read = (path: string) => readFileSync(path, "utf8");

describe("premier feedback system", () => {
  it("keeps the Assistant and internal product AI while retiring the external engineering-agent bridge", () => {
    expect(existsSync("features/agent/assistant/server/answerAssistant.ts")).toBe(true);
    expect(existsSync("features/agent/server/runAgent.ts")).toBe(true);

    expect(existsSync("features/agent/server/teamClient.ts")).toBe(false);
    expect(existsSync("features/agent/server/requestIntake.ts")).toBe(false);
    expect(existsSync("features/agent/server/humanApprovalIntent.ts")).toBe(false);
    expect(existsSync("features/shared/lib/server/agent-api-secrets.ts")).toBe(false);
    expect(existsSync("app/api/agent/requests/route.ts")).toBe(false);
    expect(existsSync("features/agent/agent-console/app/agent/page.tsx")).toBe(false);
    expect(existsSync("app/api/internal/agent/approval-intents/consume/route.ts")).toBe(false);
    expect(existsSync("app/api/internal/agent/ai-usage/route.ts")).toBe(false);
  });

  it("never dispatches feedback intake into autonomous engineering work", () => {
    const route = read("app/api/feedback/route.ts");
    const triage = read("features/feedback/server/triageFeedback.ts");

    expect(route).toContain("triageFeedback");
    expect(route).toContain('.from("agent_requests")');
    expect(route).not.toContain("teamClient");
    expect(route).not.toContain("requestIntake");
    expect(route).not.toContain("create_pull_request");
    expect(route).not.toContain("github_branch");

    expect(triage).toContain('purpose: "fast"');
    expect(triage).toContain('feature: "feedback_triage"');
    expect(triage).toContain("maxOutputTokens: 350");
    expect(triage).toContain(
      "Do not propose code, branches, pull requests, or autonomous engineering work.",
    );
  });

  it("uses product-feedback lifecycle semantics over the compatibility ledger", () => {
    expect(legacyStatusForFeedback("new")).toBe("submitted");
    expect(legacyStatusForFeedback("reviewing")).toBe("approved");
    expect(legacyStatusForFeedback("planned")).toBe("awaiting_approval");
    expect(legacyStatusForFeedback("in_progress")).toBe("in_progress");
    expect(legacyStatusForFeedback("completed")).toBe("merged");
    expect(legacyStatusForFeedback("declined")).toBe("rejected");

    expect(feedbackStatusFromLegacy("merged")).toBe("completed");
    expect(feedbackStatusFromLegacy("failed")).toBe("new");
  });

  it("classifies the shared product surfaces from the route that generated feedback", () => {
    expect(inferFeedbackSurface("/dashboard/work-orders")).toBe("shop");
    expect(inferFeedbackSurface("/fleet/assets")).toBe("fleet");
    expect(inferFeedbackSurface("/field/dispatch")).toBe("field");
    expect(inferFeedbackSurface("/equipment/assets/1")).toBe("equipment");
    expect(inferFeedbackSurface("/mobile/work-orders/1")).toBe("mobile");
    expect(inferFeedbackSurface("/portal/work-orders/1")).toBe("customer_portal");
  });

  it("mounts feedback on authenticated routes outside the desktop AppShell", () => {
    const rootBoundary = read("app/RootShellBoundary.tsx");
    const launcher = read("features/feedback/components/FeedbackLauncher.tsx");

    expect(rootBoundary).toContain("FeedbackLauncher");
    expect(rootBoundary).toContain("outsideDesktopShell && initialSession?.user?.id");
    expect(rootBoundary).toContain("showStandaloneFeedback ? <FeedbackLauncher /> : null");
    expect(launcher).toContain("FeedbackModal");
    expect(launcher).toContain('aria-label="Send feedback"');
  });

  it("supports profile-less portal customers through the verified portal identity helper", () => {
    const route = read("app/api/feedback/route.ts");
    expect(route).toContain("requirePortalCustomerAccess");
    expect(route).toContain('role: "customer"');
    expect(route).toContain("portal.customer.shop_id");
  });

  it("bounds user-controlled feedback before AI and persistence", () => {
    const route = read("app/api/feedback/route.ts");
    const modal = read("features/feedback/components/FeedbackModal.tsx");
    const triage = read("features/feedback/server/triageFeedback.ts");
    expect(route).toContain("MAX_DESCRIPTION_LENGTH = 12_000");
    expect(route).toContain("description.length > MAX_DESCRIPTION_LENGTH");
    expect(route).toContain("MAX_ATTACHMENTS = 20");
    expect(modal).toContain("maxLength={MAX_DESCRIPTION_LENGTH}");
    expect(modal).toContain("maxLength={MAX_CONTEXT_LENGTH}");
    expect(triage).toContain("MAX_TRIAGE_DESCRIPTION_LENGTH = 12_000");
    expect(triage).toContain(
      "input.description.slice(0, MAX_TRIAGE_DESCRIPTION_LENGTH)",
    );
  });

  it("does not match new feedback into terminal clusters and promotes active historical matches", () => {
    const route = read("app/api/feedback/route.ts");
    expect(route).toContain("isTerminalRow(row)");
    expect(route).toContain('metadata?.status === "completed"');
    expect(route).toContain('metadata?.status === "declined"');
    expect(read("supabase/migrations/20261013000132_feedback_atomic_control.sql")).toContain("public.feedback_metadata(to_jsonb(v_canonical))");
    expect(route).toContain("feedbackStatusFromLegacy(row.status)");
  });

  it("claims owner alert events before sending to prevent concurrent duplicate alerts", () => {
    const route = read("app/api/feedback/route.ts");
    const migration = read("supabase/migrations/20261013000132_feedback_atomic_control.sql");
    expect(migration).toContain("ownerPendingNotificationKeys");
    expect(migration).toContain("for update");
    expect(route).toContain('admin.rpc("submit_feedback"');
    expect(route).toContain("deliverFeedbackNotifications");
  });

  it("keeps requester completion messaging tenant-neutral and claims delivery per reporter", () => {
    const notifications = read("features/feedback/server/notifications.ts");
    const controlRoute = read("app/api/feedback/[id]/route.ts");

    expect(notifications).toContain(
      "A ProFixIQ improvement you requested is now available",
    );
    expect(notifications).not.toContain(
      "You previously sent feedback about: ${input.title}",
    );
    expect(notifications).not.toContain(
      "You asked, we shipped it: ${input.title}",
    );
    expect(notifications).toContain("functions.invoke(\"send-email\"");
    const delivery = read("features/feedback/server/delivery.ts");
    expect(delivery).toContain("feedback_notification");
    expect(delivery).toContain("beforeSend");
    expect(controlRoute).not.toContain("&& !deliveryMetadata.requesterNotifiedAt");
    expect(delivery).toContain("sendFeedbackCompletedEmails");
    expect(controlRoute).toContain("notifyRequesters");
  });

  it("redirects old engineering-agent control bookmarks into Feedback Control", () => {
    expect(read("app/agent/page.tsx")).toContain('redirect("/ops/feedback")');
    expect(read("app/ops/agent-control/page.tsx")).toContain(
      'redirect("/ops/feedback")',
    );
  });
});
