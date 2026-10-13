import { beforeEach, describe, expect, it, vi } from "vitest";
const call = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/openai-structured", () => ({
  runOpenAIStructuredJson: call,
}));
import { triageFeedback } from "@/features/feedback/server/triageFeedback";
beforeEach(() => {
  call.mockReset();
  call.mockImplementation(async (params) => ({
    output: params.fallback(),
    mode: "fallback",
  }));
});
describe("feedback prompt reservation", () => {
  it.each(["𓂀", "漢", "\\", "\u0000"])(
    "bounds the exact serialized prompt for adversarial input %s",
    async (text) => {
      await triageFeedback({
        description: text.repeat(12000),
        requestedKind: "bug",
        pathname: text.repeat(500),
        role: text.repeat(100),
        shopId: "shop",
        userId: "user",
        candidates: Array.from({ length: 18 }, (_, i) => ({
          id: `cluster-${i}`,
          title: text.repeat(120),
          summary: text.repeat(500),
          kind: "bug",
          surface: "shop",
          submissionCount: 10,
        })),
      });
      const params = call.mock.calls[0][0];
      expect(
        new TextEncoder().encode(params.system + JSON.stringify(params.user))
          .length,
      ).toBeLessThanOrEqual(7000);
      expect(params.maxOutputTokens).toBe(350);
      expect(params.telemetry).toEqual({
        endpoint: "/api/feedback",
        shopId: "shop",
        userId: "user",
      });
    },
  );
  it("does not accept duplicate IDs omitted by prompt bounding", async () => {
    await triageFeedback({
      description: "long".repeat(3000),
      requestedKind: "other",
      pathname: "/portal",
      role: null,
      shopId: null,
      userId: "user",
      candidates: [
        {
          id: "removed",
          title: "title",
          summary: "summary",
          kind: "other",
          surface: "other",
          submissionCount: 1,
        },
      ],
    });
    expect(
      call.mock.calls[0][0].validate({
        duplicateOf: "removed",
        duplicateConfidence: 1,
      }).duplicateOf,
    ).toBeNull();
  });
});
