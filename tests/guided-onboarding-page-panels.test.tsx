import * as React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { parseGuidedPageContext } from "@/features/onboarding-v2/guided/pageContext";
import {
  GUIDED_ONBOARDING_STEPS,
  buildGuidedDestination,
} from "@/features/onboarding-v2/guided/steps";

const routerPush = vi.fn();
const routerReplace = vi.fn();
let currentSearchParams = new URLSearchParams();
let currentPathname = "/customers/search";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => currentPathname,
}));

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const productionPageFiles = [
  "features/customers/app/customers/[id]/page.tsx",
  "features/vehicles/app/vehicles/page.tsx",
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
  routerReplace.mockReset();
  currentSearchParams = new URLSearchParams();
  currentPathname = "/customers/search";
  window.sessionStorage.clear();
  window.localStorage.clear();
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
    expect(
      screen.getByRole("heading", { name: "Customers" }),
    ).toBeInTheDocument();
    expect(screen.getByText("What to do here")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark step complete" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Skip for now" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to guided setup" }),
    ).toBeInTheDocument();
  });


  it("restores guided context from storage when safe params are missing", async () => {
    currentPathname = "/billing";
    window.sessionStorage.setItem(
      "profixiq:guided-onboarding:v2:active-context",
      JSON.stringify({
        setup: "guided",
        guidedSessionId: "session-restore",
        guidedStep: "invoices",
        returnTo: "/dashboard/onboarding-v2/session-restore",
        highlight: "invoices",
        focus: "invoices",
        savedAt: Date.now(),
      }),
    );

    render(<GuidedPageStepPanel />);

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        "/billing?setup=guided&guidedSessionId=session-restore&guidedStep=invoices&returnTo=%2Fdashboard%2Fonboarding-v2%2Fsession-restore&highlight=invoices&focus=invoices",
        { scroll: false },
      );
    });
  });

  it("does not restore guided context onto unrelated regular pages", async () => {
    currentPathname = "/billing";
    window.sessionStorage.setItem(
      "profixiq:guided-onboarding:v2:active-context",
      JSON.stringify({
        setup: "guided",
        guidedSessionId: "session-restore",
        guidedStep: "customers",
        returnTo: "/dashboard/onboarding-v2/session-restore",
        highlight: "customer-import",
        savedAt: Date.now(),
      }),
    );

    const { container } = render(<GuidedPageStepPanel />);

    expect(container).toBeEmptyDOMElement();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(routerReplace).not.toHaveBeenCalled();
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
      guidedStep: "parts",
      returnTo: "/dashboard/onboarding-v2/session-123",
      highlight: "parts",
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    render(<GuidedPageStepPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Mark step complete" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/onboarding-v2/guided/sessions/session-123/steps/parts/complete",
        { method: "POST" },
      );
    });
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/onboarding-v2/session-123",
    );

    cleanup();
    routerPush.mockReset();
    fetchMock.mockClear();
    render(<GuidedPageStepPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/onboarding-v2/guided/sessions/session-123/steps/parts/skip",
        { method: "POST" },
      );
    });
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/onboarding-v2/session-123",
    );
  });


  it("routes every guided step through the production panel complete loop", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    for (const step of GUIDED_ONBOARDING_STEPS) {
      cleanup();
      routerPush.mockReset();
      fetchMock.mockClear();
      currentSearchParams = new URLSearchParams({
        guidedSessionId: "loop-session",
        guidedStep: step.key,
        returnTo: "/dashboard/onboarding-v2/loop-session",
        highlight: step.key,
      });

      render(<GuidedPageStepPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Mark step complete" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/onboarding-v2/guided/sessions/loop-session/steps/${step.key}/complete`,
          { method: "POST" },
        );
      });
      expect(routerPush).toHaveBeenCalledWith("/dashboard/onboarding-v2/loop-session");
    }
  });

  it("provides a safe parser and fallback return path", () => {
    const context = parseGuidedPageContext(
      new URLSearchParams({
        guidedSessionId: "abc",
        guidedStep: "staff",
        returnTo: "https://bad.example",
      }),
    );

    expect(context?.stepKey).toBe("staff");
    expect(context?.returnTo).toBe("/dashboard/onboarding-v2/abc");
  });


  it("keeps guided step order focused after vehicles", () => {
    expect(GUIDED_ONBOARDING_STEPS.map((step) => step.key)).toEqual([
      "customers",
      "vehicles",
      "vehicle_history",
      "invoices",
      "parts",
      "staff",
      "pricing_shop_defaults",
      "analysis",
    ]);
  });

  it("routes pricing defaults to owner settings and leaves analysis final", () => {
    const pricingStep = GUIDED_ONBOARDING_STEPS.find((step) => step.key === "pricing_shop_defaults");
    const analysisStep = GUIDED_ONBOARDING_STEPS.at(-1);

    expect(pricingStep?.destinationPath).toBe("/dashboard/owner/settings");
    expect(buildGuidedDestination(pricingStep!, "session-xyz")).toContain("/dashboard/owner/settings?");
    expect(analysisStep?.key).toBe("analysis");
    expect(buildGuidedDestination(analysisStep!, "session-xyz")).toContain("/dashboard/onboarding-v2/session-xyz/summary?");
  });

  it("maps every guided step to a production destination with guided query params", () => {
    const expectedDestinations: Record<string, string> = {
      customers: "/customers/search",
      vehicles: "/vehicles",
      vehicle_history: "/work-orders/history",
      invoices: "/billing",
      parts: "/parts/inventory",
      staff: "/dashboard/owner/create-user",
      pricing_shop_defaults: "/dashboard/owner/settings",
      analysis: "/dashboard/onboarding-v2/session-xyz/summary",
    };

    for (const step of GUIDED_ONBOARDING_STEPS) {
      const destination = buildGuidedDestination(step, "session-xyz");
      expect(destination.startsWith(`${expectedDestinations[step.key]}?`)).toBe(
        true,
      );
      expect(destination).toContain("guidedSessionId=session-xyz");
      expect(destination).toContain(`guidedStep=${step.key}`);
      expect(destination).toContain(`highlight=${step.key === "customers" ? "customer-import" : step.key}`);
      expect(destination).toContain(
        "returnTo=%2Fdashboard%2Fonboarding-v2%2Fsession-xyz",
      );
    }
  });

  it("maps customer and vehicle guided destinations to real app routes", () => {
    expect(existsSync(join(process.cwd(), "app/customers/[id]/page.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(process.cwd(), "app/vehicles/page.tsx"))).toBe(true);

    const customerStep = GUIDED_ONBOARDING_STEPS.find(
      (step) => step.key === "customers",
    );
    const vehicleStep = GUIDED_ONBOARDING_STEPS.find(
      (step) => step.key === "vehicles",
    );

    expect(customerStep?.destinationPath).toBe("/customers/search");
    expect(vehicleStep?.destinationPath).toBe("/vehicles");
  });

  it("layers panels into production pages without removing core page labels", () => {
    const combined = productionPageFiles.map(read).join("\n");

    for (const path of productionPageFiles) {
      expect(read(path)).toContain("GuidedPageStepPanel");
    }
    expect(combined).toContain("Customer Files");
    expect(combined).toContain("Vehicle Files");
    expect(combined).toContain("New team member");
    expect(combined).toContain("System summary");
    expect(combined).toContain("Inspection Templates");
    expect(combined).toContain("Service Menu");
    expect(combined).toContain("Inventory");
    expect(combined).toContain("Billing");
    expect(combined).toContain("service history");
  });

  it("keeps Customer Files default and live-search behavior capped to 20 shop-scoped rows", () => {
    const source = read("features/customers/app/customers/[id]/page.tsx");

    expect(source).toContain('placeholder="Search customers..."');
    expect(source).toContain('"No customers found yet."');
    expect(source).toContain('"No customers match your search."');
    expect(source).toContain('.eq("shop_id", shopId)');
    expect(source).toContain("setResults(sortedRows.slice(0, 20))");
    expect(source).toContain("setResults(sortCustomerRows(rows).slice(0, 20))");
    expect(source).toContain("customerSearchHaystack");
    expect(source).not.toContain("Start typing to search customers.");
  });

  it("builds Vehicle Files with default and live-search behavior capped to 20 shop-scoped rows", () => {
    const source = read("features/vehicles/app/vehicles/page.tsx");

    expect(source).toContain("Vehicle Files");
    expect(source).toContain(
      "Search by unit, VIN, plate, year, make, model, or customer.",
    );
    expect(source).toContain('placeholder="Search vehicles..."');
    expect(source).toContain("+ Create Vehicle");
    expect(source).toContain("GuidedPageStepPanel");
    expect(source).toContain('"No vehicles found yet."');
    expect(source).toContain('"No vehicles match your search."');
    expect(source).toContain('.eq("shop_id", shopId)');
    expect(source).toContain("setVisibleRows(sortedRows.slice(0, 20))");
    expect(source).toContain(
      "setVisibleRows(sortVehicleRows(rows).slice(0, 20))",
    );
    expect(source).toContain("vehicleSearchHaystack");
    expect(source).not.toContain("Start typing to search vehicles.");
  });

  it("does not introduce legacy guided onboarding or auth helper regressions", () => {
    const guidedSource = [
      "features/onboarding-v2/components/GuidedPageStepPanel.tsx",
      "features/onboarding-v2/guided/pageContext.ts",
      "features/onboarding-v2/guided/steps.ts",
    ]
      .map(read)
      .join("\n");

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
