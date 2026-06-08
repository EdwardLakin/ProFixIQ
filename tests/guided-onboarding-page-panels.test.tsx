import * as React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { parseGuidedPageContext } from "@/features/onboarding-v2/guided/pageContext";
import { GUIDED_ONBOARDING_STEPS, buildGuidedDestination } from "@/features/onboarding-v2/guided/steps";

const routerPush = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => currentSearchParams,
}));

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const productionPageFiles = [
  "features/customers/app/customers/[id]/page.tsx",
  "features/dashboard/app/dashboard/owner/create-user/page.tsx",
  "features/dashboard/app/dashboard/owner/settings/page.tsx",
  "features/inspections/app/inspection/templates/page.tsx",
  "app/menu/page.tsx",
  "app/parts/inventory/page.tsx",
  "app/billing/page.tsx",
  "app/work-orders/history/WorkOrdersHistoryClient.tsx",
];

beforeEach(() => {
  routerPush.mockReset();
  currentSearchParams = new URLSearchParams();
  vi.restoreAllMocks();
});

describe("guided onboarding page panels", () => {
  it("renders nothing for normal production page visits", () => {
    const { container } = render(<GuidedPageStepPanel />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Guided setup")).not.toBeInTheDocument();
  });

  it("renders a focused step panel when valid guided query params are present", () => {
    currentSearchParams = new URLSearchParams({
      guidedSessionId: "session-123",
      guidedStep: "customers",
      returnTo: "/dashboard/onboarding-v2/session-123",
      highlight: "customers",
    });

    render(<GuidedPageStepPanel />);

    expect(screen.getByText("Guided setup")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getByText("What to do here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark step complete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to guided setup" })).toBeInTheDocument();
  });

  it("rejects unknown guided steps before rendering", () => {
    currentSearchParams = new URLSearchParams({
      guidedSessionId: "session-123",
      guidedStep: "not_a_step",
      returnTo: "/dashboard/onboarding-v2/session-123",
    });

    const { container } = render(<GuidedPageStepPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it("complete and skip use guided API routes and return to the control room", async () => {
    currentSearchParams = new URLSearchParams({
      guidedSessionId: "session-123",
      guidedStep: "inventory_parts",
      returnTo: "/dashboard/onboarding-v2/session-123",
      highlight: "inventory_parts",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    render(<GuidedPageStepPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Mark step complete" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/onboarding-v2/guided/sessions/session-123/steps/inventory_parts/complete",
        { method: "POST" },
      );
    });
    expect(routerPush).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123");

    cleanup();
    routerPush.mockReset();
    fetchMock.mockClear();
    render(<GuidedPageStepPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/onboarding-v2/guided/sessions/session-123/steps/inventory_parts/skip",
        { method: "POST" },
      );
    });
    expect(routerPush).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123");
  });

  it("provides a safe parser and fallback return path", () => {
    const context = parseGuidedPageContext(
      new URLSearchParams({ guidedSessionId: "abc", guidedStep: "staff", returnTo: "https://bad.example" }),
    );

    expect(context?.stepKey).toBe("staff");
    expect(context?.returnTo).toBe("/dashboard/onboarding-v2/abc");
  });

  it("maps every guided step to a production destination with guided query params", () => {
    const expectedDestinations: Record<string, string> = {
      customers: "/customers/directory",
      vehicles: "/customers/directory",
      staff: "/dashboard/owner/create-user",
      labor_tax_shop_settings: "/dashboard/owner/settings",
      inspection_templates: "/inspections/templates",
      service_menu: "/menu",
      inventory_parts: "/parts/inventory",
      invoices: "/billing",
      service_history: "/work-orders/history",
    };

    for (const step of GUIDED_ONBOARDING_STEPS) {
      const destination = buildGuidedDestination(step, "session-xyz");
      expect(destination.startsWith(`${expectedDestinations[step.key]}?`)).toBe(true);
      expect(destination).toContain("guidedSessionId=session-xyz");
      expect(destination).toContain(`guidedStep=${step.key}`);
      expect(destination).toContain(`highlight=${step.key}`);
      expect(destination).toContain("returnTo=%2Fdashboard%2Fonboarding-v2%2Fsession-xyz");
    }
  });

  it("layers panels into production pages without removing core page labels", () => {
    const combined = productionPageFiles.map(read).join("\n");

    for (const path of productionPageFiles) {
      expect(read(path)).toContain("GuidedPageStepPanel");
    }
    expect(combined).toContain("Customer Files");
    expect(combined).toContain("New team member");
    expect(combined).toContain("System summary");
    expect(combined).toContain("Inspection Templates");
    expect(combined).toContain("Service Menu");
    expect(combined).toContain("Inventory");
    expect(combined).toContain("Billing");
    expect(combined).toContain("service history");
  });

  it("does not introduce legacy guided onboarding or auth helper regressions", () => {
    const guidedSource = [
      "features/onboarding-v2/components/GuidedPageStepPanel.tsx",
      "features/onboarding-v2/guided/pageContext.ts",
      "features/onboarding-v2/guided/steps.ts",
    ].map(read).join("\n");

    expect(guidedSource).not.toContain("Onboarding Agent");
    expect(guidedSource).not.toContain("onboarding_" + "sessions");
    expect(guidedSource).not.toContain("@supabase/" + "auth-helpers-nextjs");
    expect(guidedSource).not.toContain("createRoute" + "HandlerClient");
    expect(guidedSource).not.toContain("createServer" + "ComponentClient");
    expect(guidedSource).not.toContain("createClient" + "ComponentClient");
    expect(guidedSource).not.toContain("createServer" + "ActionClient");
    expect(guidedSource).not.toMatch(/profiles[^\n]*shop_id/);
    expect(guidedSource).not.toMatch(/update\(\{[^}]*shop_id/);
  });
});
