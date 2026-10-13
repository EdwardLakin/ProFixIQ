import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), invoke: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    auth: { admin: { getUserById: mocks.lookup } },
    functions: { invoke: mocks.invoke },
  }),
}));
import { sendFeedbackCompletedEmails } from "@/features/feedback/server/notifications";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({
    data: { user: { email: "reporter@example.test" } },
    error: null,
  });
  mocks.invoke.mockResolvedValue({ error: null });
});
describe("completion mail privacy and dispatch recovery", () => {
  it("sends only a generic product notice after the fenced dispatch begins", async () => {
    const beforeSend = vi.fn().mockImplementation(async () => {
      expect(mocks.invoke).not.toHaveBeenCalled();
      return true;
    });
    const result = await sendFeedbackCompletedEmails({
      reporterIds: ["reporter"],
      beforeSend,
    });
    expect(beforeSend).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("send-email", {
      body: {
        to: "reporter@example.test",
        subject: "A ProFixIQ improvement you requested is now available",
        text: "Thanks for helping improve ProFixIQ.\n\nAn item you previously asked us to improve has now been completed in ProFixIQ.\n\nWe appreciate the feedback — it directly helps us decide what to improve next.",
      },
    });
    expect(result.deliveredReporterIds).toEqual(["reporter"]);
  });
  it("does not dispatch when a reservation expired or another worker took it", async () => {
    const result = await sendFeedbackCompletedEmails({
      reporterIds: ["reporter"],
      beforeSend: async () => false,
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(result.retryReporterIds).toEqual(["reporter"]);
  });
  it("retains uncertain external failures for explicit Ops resend rather than automatic retries", async () => {
    mocks.invoke.mockRejectedValue(new Error("response lost"));
    const result = await sendFeedbackCompletedEmails({
      reporterIds: ["reporter"],
      beforeSend: async () => true,
    });
    expect(result.unknownReporterIds).toEqual(["reporter"]);
    expect(result.retryReporterIds).toEqual([]);
  });
  it("automatically retries a lookup failure before email dispatch", async () => {
    mocks.lookup.mockResolvedValue({ error: { status: 503 }, data: {} });
    const beforeSend = vi.fn();
    const result = await sendFeedbackCompletedEmails({
      reporterIds: ["reporter"],
      beforeSend,
    });
    expect(result.retryReporterIds).toEqual(["reporter"]);
    expect(beforeSend).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("records a permanently removed requester without trying to send", async () => {
    mocks.lookup.mockResolvedValue({ error: { status: 404 }, data: {} });
    const result = await sendFeedbackCompletedEmails({
      reporterIds: ["removed"],
    });
    expect(result.unreachableReporterIds).toEqual(["removed"]);
    expect(result.retryReporterIds).toEqual([]);
  });
});
