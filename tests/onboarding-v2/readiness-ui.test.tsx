import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfirmActivationPanel } from "@/features/onboarding-v2/components/ConfirmActivationPanel";
import { SessionWorkspace } from "@/features/onboarding-v2/components/SessionWorkspace";
import { ReviewItemsQueue } from "@/features/onboarding-v2/components/ReviewItemsQueue";
import { normalizeAgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";

describe("readiness UI", () => {
  it("session workspace renders verify-only readiness from proxy", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("agent-readiness")) return { json: async () => ({ ok: true, rolloutStage: "http_verify_only", connector: { mode: "proxy", configured: true, liveMaterializationEnabled: false, canValidateShop: true, canWriteLive: false }, warnings: ["verify"] }) };
      if (url.includes("events") || url.includes("files")) return { json: async () => ({ items: [] }) };
      return { json: async () => ({ status: "running", canConfirm: false }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionWorkspace sessionId="sess_1" />);
    expect(await screen.findByText(/Agent readiness: Connected \/ verify-only/i)).toBeInTheDocument();
  });

  it("normalizer maps configured http_verify_only as connected verify-only", () => {
    const readiness = normalizeAgentReadiness({
      ok: true,
      rolloutStage: "http_verify_only",
      connector: { mode: "unknown", configured: true, liveMaterializationEnabled: false, canValidateShop: true, canWriteLive: false },
      warnings: [],
    });
    expect(readiness.ok).toBe(true);
    expect(readiness.connector.configured).toBe(true);
    expect(readiness.rolloutStage).toBe("http_verify_only");
  });

  it("confirm panel disables when canWriteLive is false", () => {
    render(<ConfirmActivationPanel readiness={normalizeAgentReadiness({ ok: true, rolloutStage: "live_enabled", connector: { mode: "x", configured: true, liveMaterializationEnabled: true, canValidateShop: true, canWriteLive: false }, warnings: [] })} summary={{ canConfirm: true }} />);
    expect(screen.getByRole("button", { name: /confirm activation/i })).toBeDisabled();
    expect(screen.getByText(/Verify-only mode is active/i)).toBeInTheDocument();
  });

  it("review page banner renders verify-only status", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("agent-readiness")) return { json: async () => ({ ok: true, rolloutStage: "dry_run", connector: { mode: "proxy", configured: true, liveMaterializationEnabled: false, canValidateShop: true, canWriteLive: false }, warnings: [] }) };
      return { json: async () => ({ items: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewItemsQueue sessionId="sess_2" />);
    expect(await screen.findByText(/Agent readiness: Verify-only/i)).toBeInTheDocument();
  });

  it("normalizer strips raw_data from readiness payload", () => {
    const readiness = normalizeAgentReadiness({ ok: true, raw_data: { secret: "x" }, connector: { configured: false } });
    expect(JSON.stringify(readiness)).not.toContain("raw_data");
  });
});
