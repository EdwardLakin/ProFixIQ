import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerCsvImportCard } from "@/features/customers/components/CustomerCsvImportCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";
import { POST as importCustomers } from "../../app/api/customers/import/route";

const { router, mockSupabaseState } = vi.hoisted(() => ({
  router: { push: vi.fn(), back: vi.fn() },
  mockSupabaseState: {
    user: { id: "user-1" } as { id: string } | null,
    profileShopId: "shop-real" as string | null,
    customers: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ payload: Record<string, unknown>; filters: Record<string, unknown> }>,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

type MockQuery = {
  filters: Record<string, unknown>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeQuery(table: string): MockQuery {
  const query: MockQuery = {
    filters: {} as Record<string, unknown>,
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      query.filters[column] = value;
      return query;
    }),
    or: vi.fn((value: string) => {
      query.filters.or = value;
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles") return { data: { shop_id: mockSupabaseState.profileShopId }, error: null };
      const match: Record<string, unknown> | undefined = mockSupabaseState.customers.find((customer) => {
        if (query.filters.email) return customer.email === query.filters.email && customer.shop_id === query.filters.shop_id;
        if (query.filters.name) return customer.name === query.filters.name && customer.shop_id === query.filters.shop_id;
        if (query.filters.or) return (customer.phone === "5551112222" || customer.phone_number === "5551112222") && customer.shop_id === query.filters.shop_id;
        return false;
      });
      return { data: match ? { id: match.id } : null, error: null };
    }),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      mockSupabaseState.inserts.push(payload);
      return { data: null, error: null };
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      const updateQuery: { eq: ReturnType<typeof vi.fn> } = {
        eq: vi.fn((column: string, value: unknown) => {
          query.filters[column] = value;
          if (column === "id") mockSupabaseState.updates.push({ payload, filters: { ...query.filters } });
          return updateQuery;
        }),
      };
      return updateQuery;
    }),
  };
  return query;
}

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createRouteHandlerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mockSupabaseState.user }, error: null })),
    },
    from: vi.fn((table: string) => makeQuery(table)),
  })),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "customers",
  highlight: "customer-import",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

async function uploadCsv(csv: string) {
  const input = screen.getByTestId("customer-csv-file-input") as HTMLInputElement;
  const file = new File([csv], "customers.csv", { type: "text/csv" });
  await userEvent.upload(input, file);
}

describe("CustomerCsvImportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profileShopId = "shop-real";
    mockSupabaseState.customers = [];
    mockSupabaseState.inserts = [];
    mockSupabaseState.updates = [];
  });

  it("renders the Customers-owned import card in normal mode", () => {
    render(<CustomerCsvImportCard onCreateCustomer={vi.fn()} />);

    expect(screen.getByTestId("customer-csv-import-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Import customers" })).toBeInTheDocument();
    expect(screen.queryByText("Return to Data Onboarding")).not.toBeInTheDocument();
  });

  it("highlights the Customers-owned import card in onboarding mode", () => {
    render(<CustomerCsvImportCard guidedQuery={guidedQuery} onCreateCustomer={vi.fn()} />);

    expect(screen.getByText("Customer setup/import")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload your customer CSV here" })).toBeInTheDocument();
    expect(screen.getByText("This import lives on the Customers page so you can find it later.")).toBeInTheDocument();
    expect(screen.getByText("Return to Data Onboarding")).toBeInTheDocument();
  });

  it("shows a CSV preview after selecting a valid CSV", async () => {
    render(<CustomerCsvImportCard />);

    await uploadCsv("first_name,last_name,email,phone\nAda,Lovelace,ada@example.com,(555) 111-2222\n");

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Rows parsed")).toBeInTheDocument();
  });

  it("calls onboarding completion only after a successful onboarding import", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/customers/import") return { ok: true, json: async () => ({ ok: true, counts: { created: 1, updated: 0, skipped: 0, failed: 0 } }) };
      return okJson();
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard guidedQuery={guidedQuery} />);

    await uploadCsv("first_name,last_name,email\nAda,Lovelace,ada@example.com\n");
    await userEvent.click(await screen.findByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/customers/complete",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  it("does not call onboarding completion in normal mode", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, counts: { created: 1, updated: 0, skipped: 0, failed: 0 } }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard />);

    await uploadCsv("first_name,last_name,email\nAda,Lovelace,ada@example.com\n");
    await userEvent.click(await screen.findByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/onboarding-v2/"), expect.anything());
  });

  it("keeps skip customers available during onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard guidedQuery={guidedQuery} />);

    await userEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/customers/skip",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("POST /api/customers/import", () => {
  beforeEach(() => {
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profileShopId = "shop-real";
    mockSupabaseState.customers = [];
    mockSupabaseState.inserts = [];
    mockSupabaseState.updates = [];
  });

  it("rejects unauthenticated imports", async () => {
    mockSupabaseState.user = null;
    const response = await importCustomers(new Request("http://localhost/api/customers/import", { method: "POST", body: JSON.stringify({ rows: [] }) }));

    expect(response.status).toBe(401);
  });

  it("rejects imports when the user has no shop", async () => {
    mockSupabaseState.profileShopId = null;
    const response = await importCustomers(new Request("http://localhost/api/customers/import", { method: "POST", body: JSON.stringify({ rows: [] }) }));

    expect(response.status).toBe(403);
  });

  it("does not accept client shop_id and imports into the authenticated profile shop", async () => {
    const response = await importCustomers(new Request("http://localhost/api/customers/import", {
      method: "POST",
      body: JSON.stringify({ rows: [{ first_name: "Ada", last_name: "Lovelace", email: "Ada@Example.com", shop_id: "evil-shop" }] }),
    }));
    const payload = await response.json();

    expect(payload.counts).toMatchObject({ created: 1, updated: 0, skipped: 0, failed: 0 });
    expect(mockSupabaseState.inserts[0]).toMatchObject({ shop_id: "shop-real", user_id: "user-1", email: "ada@example.com" });
    expect(mockSupabaseState.inserts[0].shop_id).not.toBe("evil-shop");
  });

  it("returns successful created and updated counts", async () => {
    mockSupabaseState.customers = [{ id: "customer-1", shop_id: "shop-real", email: "existing@example.com" }];
    const response = await importCustomers(new Request("http://localhost/api/customers/import", {
      method: "POST",
      body: JSON.stringify({ rows: [
        { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
        { name: "Existing Customer", email: "existing@example.com", phone: "555-111-2222" },
        { notes: "blank row" },
      ] }),
    }));
    const payload = await response.json();

    expect(payload).toMatchObject({ ok: true, counts: { created: 1, updated: 1, skipped: 1, failed: 0 } });
    expect(mockSupabaseState.inserts).toHaveLength(1);
    expect(mockSupabaseState.updates).toHaveLength(1);
    expect(mockSupabaseState.updates[0].filters).toMatchObject({ shop_id: "shop-real", id: "customer-1" });
  });
});
