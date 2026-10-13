import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OpsDashboard from "@/features/ops/components/OpsDashboard";
import type { OpsFeedbackSummary } from "@/features/ops/lib/dashboard";

const feedbackItem: OpsFeedbackSummary = {
  id: "8b07673d-a003-462b-a4ef-dfdb9d3d4ed1",
  description: "Vehicle picker is awkward on work-order creation",
  intent: "feature_request",
  status: "submitted",
  normalized_json: {
    feedback: {
      version: 1,
      clusterId: "8b07673d-a003-462b-a4ef-dfdb9d3d4ed1",
      isCanonical: true,
      status: "new",
      kind: "workflow_improvement",
      surface: "shop",
      title: "Improve vehicle selection on work-order creation",
      summary: "Make vehicle selection faster and clearer.",
      severity: "normal",
      needsAttention: true,
      recommendation: "Review for near-term implementation.",
      aiMode: "fallback",
      aiModel: null,
      duplicateConfidence: null,
      firstSeenAt: "2026-10-12T00:00:00.000Z",
      lastSeenAt: "2026-10-12T01:00:00.000Z",
    },
  },
  reporter_id: "user-1",
  shop_id: "shop-1",
  created_at: "2026-10-12T00:00:00.000Z",
  updated_at: "2026-10-12T01:00:00.000Z",
};

describe("ops dashboard UI", () => {
  it("renders feedback metrics and deep-links attention items into Feedback Control", () => {
    render(<OpsDashboard feedback={[feedbackItem]} />);

    expect(screen.getByText("Operations overview")).toBeInTheDocument();
    expect(screen.getByText("Improve vehicle selection on work-order creation")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Improve vehicle selection on work-order creation/i }),
    ).toHaveAttribute(
      "href",
      "/ops/feedback?feedback=8b07673d-a003-462b-a4ef-dfdb9d3d4ed1",
    );
    expect(screen.getByRole("link", { name: /Open Feedback Control/i })).toHaveAttribute(
      "href",
      "/ops/feedback",
    );
    expect(screen.getByText("1 item flagged")).toBeInTheDocument();
  });
});
