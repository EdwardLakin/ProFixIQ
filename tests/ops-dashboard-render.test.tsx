import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OpsDashboard from "@/features/ops/components/OpsDashboard";
import type { OpsAgentRequestSummary } from "@/features/ops/lib/dashboard";

const approvalRequest: OpsAgentRequestSummary = {
  id: "8b07673d-a003-462b-a4ef-dfdb9d3d4ed1",
  description: "Fix inbox contrast",
  intent: "bug_report",
  status: "awaiting_approval",
  normalized_json: {},
  github_pr_number: 1400,
  github_pr_url: "https://github.com/EdwardLakin/ProFixIQ/pull/1400",
  created_at: "2026-08-08T00:00:00.000Z",
  updated_at: "2026-08-08T01:00:00.000Z",
};

describe("ops dashboard UI", () => {
  it("renders live metrics and deep-links attention items into Agent Control", () => {
    render(<OpsDashboard requests={[approvalRequest]} />);

    expect(screen.getByText("Operations overview")).toBeInTheDocument();
    expect(screen.getByText("Fix inbox contrast")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Fix inbox contrast/i }),
    ).toHaveAttribute(
      "href",
      "/ops/agent-control?request=8b07673d-a003-462b-a4ef-dfdb9d3d4ed1",
    );
    expect(screen.getByText("1 approval waiting")).toBeInTheDocument();
  });
});
