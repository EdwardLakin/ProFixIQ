import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InventoryPage from "../../app/parts/inventory/page";

const { searchParamsState, mockSupabaseState } = vi.hoisted(() => ({
  searchParamsState: { params: new URLSearchParams() },
  mockSupabaseState: {
    user: { id: "user-1" } as { id: string } | null,
    profileShopId: "shop-1" as string | null,
    locations: [{ id: "loc-1", shop_id: "shop-1", code: "MAIN", name: "Main" }] as Array<Record<string, unknown>>,
    parts: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsState.params,
}));

vi.mock("uuid", () => ({ v4: () => "part-generated" }));

type MockQuery = {
  filters: Record<string, unknown>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  then: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise<unknown>;
};

function rowsFor(table: string): unknown[] {
  if (table === "parts") return mockSupabaseState.parts;
  if (table === "stock_locations") return mockSupabaseState.locations;
  if (table === "stock_moves") return [];
  if (table === "shop_parts_source_aliases") return [];
  if (table === "shop_parts_import_staging") return [];
  return [];
}

function makeQuery(table: string): MockQuery {
  const query: MockQuery = {
    filters: {},
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      query.filters[column] = value;
      return query;
    }),
    in: vi.fn((column: string, value: unknown) => {
      query.filters[column] = value;
      return query;
    }),
    order: vi.fn(() => query),
    or: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles") return { data: { shop_id: mockSupabaseState.profileShopId }, error: null };
      return { data: null, error: null };
    }),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    then: (resolve) => Promise.resolve(resolve({ data: rowsFor(table), error: null })),
  };
  return query;
}

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createClientComponentClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mockSupabaseState.user }, error: null })),
    },
    from: vi.fn((table: string) => makeQuery(table)),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  })),
}));

function setGuidedParams() {
  searchParamsState.params = new URLSearchParams({
    onboardingSession: "session-123",
    onboardingStep: "inventory_parts",
    highlight: "parts-csv-import",
    returnTo: "/dashboard/onboarding-v2/session-123",
    source: "guided-onboarding",
  });
}

async function openAndPreviewCsv(csv = "name,sku,part_number,category,price,qty\nOil Filter,OF-1,FL-1,Filters,9.95,10\n") {
  await userEvent.click(await screen.findByRole("button", { name: "CSV Import" }));
  expect(screen.getByRole("dialog", { name: "Import inventory parts from CSV" })).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText(/Paste CSV here/i), csv);
  await userEvent.click(screen.getByRole("button", { name: "Preview CSV" }));
  expect(await screen.findByLabelText("CSV import preview")).toBeInTheDocument();
}

describe("Parts inventory CSV import page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    searchParamsState.params = new URLSearchParams();
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profileShopId = "shop-1";
    mockSupabaseState.locations = [{ id: "loc-1", shop_id: "shop-1", code: "MAIN", name: "Main" }];
    mockSupabaseState.parts = [];
  });

  it("renders the CSV Import button in normal mode", async () => {
    render(<InventoryPage />);

    expect(await screen.findByRole("button", { name: "CSV Import" })).toBeInTheDocument();
    expect(screen.queryByText("Upload/setup here")).not.toBeInTheDocument();
  });

  it("opens clear upload and preview UI when CSV Import is clicked", async () => {
    render(<InventoryPage />);

    await openAndPreviewCsv();

    expect(screen.getByTestId("parts-csv-file-input")).toBeInTheDocument();
    expect(screen.getByText("Oil Filter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeEnabled();
  });

  it("renders the highlighted import area in guided onboarding mode", async () => {
    setGuidedParams();
    render(<InventoryPage />);

    expect(await screen.findByText("Import inventory parts")).toBeInTheDocument();
    expect(screen.getByText(/mark this guided step complete only after you explicitly import/i)).toBeInTheDocument();
    expect(screen.getAllByText("Return to Data Onboarding").length).toBeGreaterThan(0);
  });

  it("calls guided completion only after a successful explicit import", async () => {
    setGuidedParams();
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/parts/import") {
        return { ok: true, json: async () => ({ ok: true, counts: { importedCount: 1, stockReceiveCount: 1 } }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InventoryPage />);

    await openAndPreviewCsv();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/onboarding-v2/"), expect.anything());
    await userEvent.click(screen.getByRole("button", { name: "Confirm import" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/inventory_parts/complete",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(screen.getAllByText("Return to Data Onboarding").length).toBeGreaterThan(0);
  });

  it("does not call guided completion when import fails", async () => {
    setGuidedParams();
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: "Bad CSV" }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InventoryPage />);

    await openAndPreviewCsv();
    await userEvent.click(screen.getByRole("button", { name: "Confirm import" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Bad CSV"));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/onboarding-v2/"), expect.anything());
  });

  it("does not call guided completion when the modal is cancelled", async () => {
    setGuidedParams();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<InventoryPage />);

    await openAndPreviewCsv();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call guided completion without onboarding params", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, counts: { importedCount: 1, stockReceiveCount: 0 } }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InventoryPage />);

    await openAndPreviewCsv();
    await userEvent.click(screen.getByRole("button", { name: "Confirm import" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/parts/import", expect.objectContaining({ method: "POST" })));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/onboarding-v2/"), expect.anything());
  });
});
