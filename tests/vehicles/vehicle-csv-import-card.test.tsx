import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VehicleCsvImportCard } from "@/features/vehicles/components/VehicleCsvImportCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "vehicles",
  highlight: "vehicle-import",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function importOk() {
  return { ok: true, json: async () => ({ ok: true, counts: { created: 1, updated: 0, skipped: 0, failed: 0, warnings: 0 } }) };
}

function onboardingOk() {
  return { ok: true, json: async () => ({ ok: true }) };
}

describe("VehicleCsvImportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows import entry in normal mode without onboarding highlight", () => {
    render(<VehicleCsvImportCard customers={[]} />);

    expect(screen.getByTestId("vehicle-csv-import-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /vehicle csv import/i })).toBeInTheDocument();
    expect(screen.queryByText(/guided onboarding routed/i)).not.toBeInTheDocument();
  });

  it("shows guided copy and return link for guided URL state", () => {
    render(<VehicleCsvImportCard customers={[]} guidedQuery={guidedQuery} highlighted />);

    expect(screen.getByText(/Guided onboarding routed you to the real Vehicles page/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /return to data onboarding/i })).toHaveAttribute("href", "/dashboard/onboarding-v2/session-123");
  });

  it("previews invalid rows and does not import on preview", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<VehicleCsvImportCard customers={[]} />);

    await userEvent.type(screen.getByLabelText(/paste csv text/i), "unit,vin\n,\n");
    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));

    expect(screen.getAllByText("invalid").length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls vehicle import on confirm", async () => {
    const fetchMock = vi.fn(async () => importOk());
    vi.stubGlobal("fetch", fetchMock);
    render(<VehicleCsvImportCard customers={[]} />);

    await userEvent.type(screen.getByLabelText(/paste csv text/i), "unit,make,model\nA-1,Ford,F-150");
    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/vehicles/import", expect.objectContaining({ method: "POST" })));
  });

  it("previews vehicle customer_id as a linked customer external_id", async () => {
    render(<VehicleCsvImportCard customers={[{ id: "customer-uuid", external_id: "CUST-100425", name: "Fleet Customer" }]} />);

    await userEvent.type(screen.getByLabelText(/paste csv text/i), "vehicle_id,unit_number,customer_id\nVEH-1,A-1,CUST-100425");
    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));

    expect(screen.getByText("customer-uuid")).toBeInTheDocument();
    expect(screen.queryByText("Unlinked")).not.toBeInTheDocument();
    expect(screen.queryByText(/No matching customer found/i)).not.toBeInTheDocument();
  });


  it("clears selected CSV and disables confirm after a successful import", async () => {
    const fetchMock = vi.fn(async () => importOk());
    vi.stubGlobal("fetch", fetchMock);
    render(<VehicleCsvImportCard customers={[]} />);

    const fileInput = screen.getByTestId("vehicle-csv-file") as HTMLInputElement;
    await userEvent.upload(fileInput, new File(["unit,vin\nA-1,1HGCM82633A004352"], "vehicles.csv", { type: "text/csv" }));
    expect(fileInput.files?.[0]?.name).toBe("vehicles.csv");

    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));
    const confirmButton = screen.getByRole("button", { name: /confirm import/i });
    await userEvent.click(confirmButton);

    await waitFor(() => expect(screen.getByText(/import complete: 1 created/i)).toBeInTheDocument());
    expect(fileInput.value).toBe("");
    expect(screen.getByLabelText(/paste csv text/i)).toHaveValue("");
    expect(screen.queryByText("A-1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm import/i })).toBeDisabled();
  });

  it("does not POST again when confirm is clicked after a successful import", async () => {
    const fetchMock = vi.fn(async () => importOk());
    vi.stubGlobal("fetch", fetchMock);
    render(<VehicleCsvImportCard customers={[]} />);

    await userEvent.type(screen.getByLabelText(/paste csv text/i), "unit\nA-1");
    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls guided completion only after successful import", async () => {
    const fetchMock = vi.fn(async (url: string) => (url.includes("/api/vehicles/import") ? importOk() : onboardingOk()));
    vi.stubGlobal("fetch", fetchMock);
    render(<VehicleCsvImportCard customers={[]} guidedQuery={guidedQuery} highlighted />);

    await userEvent.type(screen.getByLabelText(/paste csv text/i), "unit\nA-1");
    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/onboarding-v2/guided/sessions/session-123/steps/vehicles/complete", expect.objectContaining({ method: "POST" })));
  });

  it("does not call guided completion on failed import or cancel", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: "failed" }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<VehicleCsvImportCard customers={[]} guidedQuery={guidedQuery} highlighted />);

    await userEvent.type(screen.getByLabelText(/paste csv text/i), "unit\nA-1");
    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel\/reset/i }));
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/paste csv text/i), "unit\nA-1");
    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("failed"));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/steps/vehicles/complete"), expect.anything());
  });
});
