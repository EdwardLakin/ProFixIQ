import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingSummaryPage, RecommendationsPanel } from "@/features/onboarding-v2/components/OnboardingSummaryPage";

describe("onboarding v2 summary ui", () => {
  it("renders empty summary state for not_implemented", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("agent-readiness")) return { json: async () => ({ ok: true, connector: { canWriteLive: false, liveMaterializationEnabled: false } }) };
      if (url.endsWith("/summary")) return { json: async () => ({ ok: false, failureKind: "not_implemented" }) };
      if (url.endsWith("/recommendations")) return { json: async () => ({ items: [] }) };
      return { json: async () => ({ ok: true, status: "running" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<OnboardingSummaryPage sessionId="sess_1" />);
    expect(await screen.findByText(/Final business summary will appear after the agent completes activation/i)).toBeInTheDocument();
    expect(await screen.findByText(/No live ProFixIQ records were written/i)).toBeInTheDocument();
  });

  it("groups recommendation types", () => {
    render(<RecommendationsPanel grouped={{ menu: [{ title: "Menu A" }], inspection: [{ title: "Inspect" }], pricing: [{ title: "Price" }], workflow: [{ title: "Alert" }], cleanup: [{ title: "Cleanup" }], other: [] }} />);
    expect(screen.getByText(/Menu\/canned job suggestions/i)).toBeInTheDocument();
    expect(screen.getByText("Menu A")).toBeInTheDocument();
    expect(screen.getByText("Inspect")).toBeInTheDocument();
  });

  it("shows verify-only readiness banner", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("agent-readiness")) return { json: async () => ({ ok: true, rolloutStage: "dry_run", connector: { mode: "proxy", configured: true, liveMaterializationEnabled: false, canValidateShop: true, canWriteLive: false }, warnings: [] }) };
      if (url.endsWith("/recommendations")) return { json: async () => ({ items: [] }) };
      return { json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<OnboardingSummaryPage sessionId="sess_2" />);
    expect(await screen.findByText(/Agent readiness: Verify-only/i)).toBeInTheDocument();
  });
});
