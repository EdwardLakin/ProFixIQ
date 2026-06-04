import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidedOnboardingWorkspace } from "@/features/onboarding-v2/components/GuidedOnboardingWorkspace";
import { GUIDED_ONBOARDING_STEPS, type GuidedOnboardingStatus } from "@/features/onboarding-v2/guided/steps";
import type { GuidedOnboardingPayload, GuidedSessionRow, GuidedStepRow } from "@/features/onboarding-v2/guided/types";

const router = { push: vi.fn(), replace: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function payload(options: {
  existingSystemImport?: "yes" | "no";
  currentStepKey?: GuidedSessionRow["current_step_key"];
  statusByStep?: Partial<Record<GuidedStepRow["step_key"], GuidedOnboardingStatus>>;
  sessionStatus?: string;
} = {}): GuidedOnboardingPayload & { ok: true; destinationUrl?: string | null; redirectTo?: string | null } {
  const now = "2026-06-04T00:00:00.000Z";
  return {
    ok: true,
    session: {
      id: "session-1",
      shop_id: "shop-1",
      created_by: "user-1",
      status: options.sessionStatus ?? "active",
      current_step_key: options.currentStepKey ?? null,
      summary: options.existingSystemImport ? { existingSystemImport: options.existingSystemImport } : {},
      created_at: now,
      updated_at: now,
      completed_at: options.sessionStatus === "completed" ? now : null,
    },
    steps: GUIDED_ONBOARDING_STEPS.map((step) => ({
      id: `${step.stepKey}-row`,
      session_id: "session-1",
      shop_id: "shop-1",
      step_key: step.stepKey,
      status: options.statusByStep?.[step.stepKey] ?? "not_started",
      destination_path: step.destinationPath,
      highlight_key: step.highlightKey,
      skipped_reason: null,
      summary: {},
      error: null,
      retry_count: 0,
      created_at: now,
      updated_at: now,
      completed_at: null,
    })),
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}

describe("guided onboarding entry UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the existing-system gate before Customers on a new session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(payload())));

    render(<GuidedOnboardingWorkspace />);

    expect(await screen.findByRole("heading", { name: /do you currently have an existing shop\/system to import\?/i })).toBeInTheDocument();
    expect(screen.queryByText(/do you want to bring in your customer list now\?/i)).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-1");
  });

  it("answering NO skips guided import and returns to dashboard", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/existing-system")) {
        return jsonResponse({ ...payload({ existingSystemImport: "no", sessionStatus: "completed", statusByStep: Object.fromEntries(GUIDED_ONBOARDING_STEPS.map((step) => [step.stepKey, "skipped"])) }), redirectTo: "/dashboard" });
      }
      return jsonResponse(payload());
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GuidedOnboardingWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: /no, start from empty/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
    expect(fetchMock).toHaveBeenCalledWith("/api/onboarding-v2/guided/sessions/session-1/existing-system", expect.objectContaining({ method: "POST" }));
  });

  it("answering YES activates Customers as asked instead of routing", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/existing-system")) {
        return jsonResponse(payload({ existingSystemImport: "yes", currentStepKey: "customers", statusByStep: { customers: "asked" } }));
      }
      return jsonResponse(payload());
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GuidedOnboardingWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: /yes, guide me through import/i }));

    expect(await screen.findByRole("heading", { name: /do you want to bring in your customer list now\?/i })).toBeInTheDocument();
    expect(screen.getAllByText("asked").length).toBeGreaterThan(0);
    expect(screen.queryByText("routing")).not.toBeInTheDocument();
  });

  it("sets Customers to routing only after the explicit route action", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/existing-system")) {
        return jsonResponse(payload({ existingSystemImport: "yes", currentStepKey: "customers", statusByStep: { customers: "asked" } }));
      }
      if (url.endsWith("/steps/customers/answer")) {
        return jsonResponse({
          ...payload({ existingSystemImport: "yes", currentStepKey: "customers", statusByStep: { customers: "routing" } }),
          destinationUrl: "/customers?onboardingSession=session-1&onboardingStep=customers&highlight=customers-import&source=guided-onboarding",
        });
      }
      return jsonResponse(payload());
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GuidedOnboardingWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: /yes, guide me through import/i }));
    await userEvent.click(await screen.findByRole("button", { name: /yes, route me there/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(expect.stringContaining("/customers?onboardingSession=session-1")));
    await waitFor(() => expect(screen.getAllByText("routing").length).toBeGreaterThan(0));
    expect(screen.getByRole("link", { name: /continue to customers/i })).toBeInTheDocument();
  });

  it("does not expose V2 in the user-facing page title", () => {
    const indexPage = readFileSync("app/dashboard/onboarding-v2/page.tsx", "utf8");
    const sessionPage = readFileSync("app/dashboard/onboarding-v2/[sessionId]/page.tsx", "utf8");

    expect(indexPage).toContain('title="Data Onboarding"');
    expect(sessionPage).toContain('title="Data Onboarding"');
    expect(indexPage).not.toContain("Guided Onboarding V2");
    expect(sessionPage).not.toContain("Guided Onboarding V2");
  });
});
