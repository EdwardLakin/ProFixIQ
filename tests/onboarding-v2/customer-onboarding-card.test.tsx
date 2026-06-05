import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerCsvImportCard } from "@/features/customers/components/CustomerCsvImportCard";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";
import { POST as importCustomers } from "../../app/api/customers/import/route";

const { router, mockSupabaseState } = vi.hoisted(() => ({
  router: { push: vi.fn(), back: vi.fn() },
  mockSupabaseState: {
    user: { id: "user-1" } as { id: string } | null,
    profile: { shop_id: "shop-real" } as { shop_id: string | null } | null,
    customers: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{
      payload: Record<string, unknown>;
      filters: Record<string, unknown>;
    }>,
    customerSelects: 0,
    profileSelects: 0,
    insertError: null as
      | ((
          payload: Record<string, unknown> | Record<string, unknown>[],
        ) => Record<string, unknown> | null)
      | null,
    updateError: null as
      | ((payload: Record<string, unknown>) => Record<string, unknown> | null)
      | null,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

type MockQuery = {
  filters: Record<string, unknown>;
  rangeFrom: number | null;
  rangeTo: number | null;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

function selectCustomers(filters: Record<string, unknown>) {
  return mockSupabaseState.customers.filter((customer) => {
    if (filters.shop_id && customer.shop_id !== filters.shop_id) return false;
    if (filters.external_id && customer.external_id !== filters.external_id)
      return false;
    if (filters.email && customer.email !== filters.email) return false;
    if (filters.name && customer.name !== filters.name) return false;
    if (filters.or) {
      const phone = String(filters.or).match(/phone\.eq\.([^,]+)/)?.[1];
      return customer.phone === phone || customer.phone_number === phone;
    }
    return true;
  });
}

function makeQuery(table: string): MockQuery {
  const query: MockQuery = {
    filters: {} as Record<string, unknown>,
    rangeFrom: null,
    rangeTo: null,
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      query.filters[column] = value;
      return query;
    }),
    or: vi.fn((value: string) => {
      query.filters.or = value;
      return query;
    }),
    limit: vi.fn(() => query),
    range: vi.fn((from: number, to: number) => {
      query.rangeFrom = from;
      query.rangeTo = to;
      return query;
    }),
    order: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles") {
        mockSupabaseState.profileSelects += 1;
        return { data: mockSupabaseState.profile, error: null };
      }
      const match: Record<string, unknown> | undefined = selectCustomers(
        query.filters,
      )[0];
      return { data: match ? { ...match } : null, error: null };
    }),
    insert: vi.fn(
      async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const error = mockSupabaseState.insertError?.(payload) ?? null;
        if (error) return { data: null, error };
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          mockSupabaseState.inserts.push(row);
          mockSupabaseState.customers.push({
            id: `inserted-${mockSupabaseState.inserts.length}`,
            ...row,
          });
        }
        return { data: null, error: null };
      },
    ),
    update: vi.fn((payload: Record<string, unknown>) => {
      const updateQuery: {
        eq: ReturnType<typeof vi.fn>;
        then: ReturnType<typeof vi.fn>;
      } = {
        eq: vi.fn((column: string, value: unknown) => {
          query.filters[column] = value;
          if (column === "id")
            mockSupabaseState.updates.push({
              payload,
              filters: { ...query.filters },
            });
          return updateQuery;
        }),
        then: vi.fn((resolve: (value: unknown) => unknown) => {
          const error = mockSupabaseState.updateError?.(payload) ?? null;
          return Promise.resolve(resolve({ data: null, error }));
        }),
      };
      return updateQuery;
    }),
    then: vi.fn((resolve: (value: unknown) => unknown) => {
      if (table === "customers") {
        mockSupabaseState.customerSelects += 1;
        const rows = selectCustomers(query.filters);
        const pagedRows =
          query.rangeFrom == null || query.rangeTo == null
            ? rows
            : rows.slice(query.rangeFrom, query.rangeTo + 1);
        return Promise.resolve(resolve({ data: pagedRows, error: null }));
      }
      return Promise.resolve(resolve({ data: null, error: null }));
    }),
  };
  return query;
}

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockSupabaseState.user },
        error: null,
      })),
    },
    from: vi.fn((table: string) => makeQuery(table)),
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    getAll: () => [{ name: "sb-test-auth-token", value: "redacted" }],
  })),
}));

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
  const input = screen.getByTestId(
    "customer-csv-file-input",
  ) as HTMLInputElement;
  const file = new File([csv], "customers.csv", { type: "text/csv" });
  await userEvent.upload(input, file);
}

describe("CustomerCsvImportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profile = { shop_id: "shop-real" };
    mockSupabaseState.customers = [];
    mockSupabaseState.inserts = [];
    mockSupabaseState.updates = [];
    mockSupabaseState.insertError = null;
    mockSupabaseState.updateError = null;
    mockSupabaseState.customerSelects = 0;
    mockSupabaseState.profileSelects = 0;
  });

  it("renders the Customers-owned import card in normal mode", () => {
    render(<CustomerCsvImportCard onCreateCustomer={vi.fn()} />);

    expect(screen.getByTestId("customer-csv-import-card")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Import customers" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Return to Data Onboarding"),
    ).not.toBeInTheDocument();
  });

  it("highlights the Customers-owned import card in onboarding mode", () => {
    render(
      <CustomerCsvImportCard
        guidedQuery={guidedQuery}
        onCreateCustomer={vi.fn()}
      />,
    );

    expect(screen.getByText("Customer setup/import")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Upload your customer CSV here" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This import lives on the Customers page so you can find it later.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Return to Data Onboarding")).toBeInTheDocument();
  });

  it("shows a CSV preview after selecting a valid CSV", async () => {
    render(<CustomerCsvImportCard />);

    await uploadCsv(
      "first_name,last_name,email,phone\nAda,Lovelace,ada@example.com,(555) 111-2222\n",
    );

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Rows parsed")).toBeInTheDocument();
  });

  it("calls onboarding completion only after a successful onboarding import", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/customers/import")
        return {
          ok: true,
          json: async () => ({
            ok: true,
            counts: { created: 1, updated: 0, skipped: 0, failed: 0 },
          }),
        };
      return okJson();
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard guidedQuery={guidedQuery} />);

    await uploadCsv(
      "first_name,last_name,email\nAda,Lovelace,ada@example.com\n",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /confirm import/i }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/onboarding-v2/guided/sessions/session-123/steps/customers/complete",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("does not call onboarding completion in normal mode", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        counts: { created: 1, updated: 0, skipped: 0, failed: 0 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard />);

    await uploadCsv(
      "first_name,last_name,email\nAda,Lovelace,ada@example.com\n",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /confirm import/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/onboarding-v2/"),
      expect.anything(),
    );
  });

  it("clears the selected CSV state and keeps the success summary after a successful import", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        counts: { created: 1, updated: 0, skipped: 0, failed: 0 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard />);

    await uploadCsv(
      "display_name,email,phone_primary,address1,city,province,postal_code\nAda Lovelace,ada@example.com,(555) 111-2222,123 Engine Way,Toronto,ON,M5V 2T6\n",
    );
    const confirmButton = await screen.findByRole("button", {
      name: /confirm import/i,
    });
    expect(confirmButton).toBeEnabled();

    await userEvent.click(confirmButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirmButton).toBeDisabled());
    expect(screen.getByText("No CSV selected")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.queryByText("Rows parsed")).not.toBeInTheDocument();
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.queryByText(/Detected \d+ columns/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Import results: created 1, updated 0, skipped 0, failed 0.",
      ),
    ).toBeInTheDocument();
    expect(
      (screen.getByTestId("customer-csv-file-input") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("does not send another import request when confirm is clicked after a successful import", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        counts: { created: 1, updated: 0, skipped: 0, failed: 0 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard />);

    await uploadCsv("first_name,last_name,email\nAda,Lovelace,ada@example.com\n");
    const confirmButton = await screen.findByRole("button", {
      name: /confirm import/i,
    });

    await userEvent.click(confirmButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirmButton).toBeDisabled());

    await userEvent.click(confirmButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-enables confirm after selecting and parsing a new valid CSV", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        counts: { created: 1, updated: 0, skipped: 0, failed: 0 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard />);

    await uploadCsv("first_name,last_name,email\nAda,Lovelace,ada@example.com\n");
    const confirmButton = await screen.findByRole("button", {
      name: /confirm import/i,
    });
    await userEvent.click(confirmButton);

    await waitFor(() => expect(confirmButton).toBeDisabled());
    expect(screen.getByText("No CSV selected")).toBeInTheDocument();

    await uploadCsv("first_name,last_name,email\nGrace,Hopper,grace@example.com\n");

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(confirmButton).toBeEnabled();
  });

  it("does not call onboarding completion when the import has hard failures", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/customers/import")
        return {
          ok: true,
          json: async () => ({
            ok: true,
            counts: { created: 1, updated: 0, skipped: 0, failed: 1 },
            errors: [{ row: 2, reason: "Constraint violation", code: "23514" }],
          }),
        };
      return okJson();
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard guidedQuery={guidedQuery} />);

    await uploadCsv(
      "first_name,last_name,email\nAda,Lovelace,ada@example.com\nGrace,Hopper,grace@example.com\n",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /confirm import/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/steps/customers/complete"),
      expect.anything(),
    );
    expect(
      await screen.findByText(/Import errors sample/i),
    ).toBeInTheDocument();
  });

  it("keeps skip customers available during onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCsvImportCard guidedQuery={guidedQuery} />);

    await userEvent.click(
      screen.getByRole("button", { name: /skip for now/i }),
    );

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/dashboard/onboarding-v2/session-123",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/customers/skip",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("POST /api/customers/import", () => {
  beforeEach(() => {
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profile = { shop_id: "shop-real" };
    mockSupabaseState.customers = [];
    mockSupabaseState.inserts = [];
    mockSupabaseState.updates = [];
    mockSupabaseState.insertError = null;
    mockSupabaseState.updateError = null;
    mockSupabaseState.customerSelects = 0;
    mockSupabaseState.profileSelects = 0;
  });

  it("uses the shared cookie-backed Supabase route client for authenticated imports", async () => {
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [{ name: "Ada Lovelace", email: "ada@example.com" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(createServerSupabaseRoute)).toHaveBeenCalled();
    expect(mockSupabaseState.inserts[0]).toMatchObject({
      shop_id: "shop-real",
    });
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("user_id");
  });

  it("rejects unauthenticated imports", async () => {
    mockSupabaseState.user = null;
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({ rows: [] }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects imports when the authenticated user profile is missing", async () => {
    mockSupabaseState.profile = null;
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({ rows: [] }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Profile for current user not found");
  });

  it("rejects imports when the user has no shop", async () => {
    mockSupabaseState.profile = { shop_id: null };
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({ rows: [] }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("does not accept client shop_id and imports into the authenticated profile shop", async () => {
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            {
              first_name: "Ada",
              last_name: "Lovelace",
              email: "Ada@Example.com",
              shop_id: "evil-shop",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.inserts[0]).toMatchObject({
      shop_id: "shop-real",
      email: "ada@example.com",
    });
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("user_id");
    expect(mockSupabaseState.inserts[0].shop_id).not.toBe("evil-shop");
  });

  it("maps uploaded CSV-style customer fields into the customer insert payload without user_id", async () => {
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            {
              customer_id: "CUST-100",
              customer_type: "fleet",
              company_name: "Ada Logistics",
              display_name: "Ada Logistics Display",
              first_name: "Ada",
              last_name: "Lovelace",
              email: "ADA@EXAMPLE.COM",
              phone_primary: "(555) 111-2222",
              phone_secondary: "(555) 333-4444",
              address1: "123 Engine Way",
              city: "Toronto",
              province: "ON",
              postal_code: "M5V 2T6",
              notes: "VIP fleet",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.inserts[0]).toMatchObject({
      shop_id: "shop-real",
      external_id: "CUST-100",
      is_fleet: true,
      business_name: "Ada Logistics",
      name: "Ada Logistics Display",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "5551112222",
      phone_number: "5553334444",
      address: "123 Engine Way",
      street: "123 Engine Way",
      city: "Toronto",
      province: "ON",
      postal_code: "M5V 2T6",
      notes: "VIP fleet",
    });
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("user_id");
  });

  it("does not create duplicate customer records for duplicate emails in the same shop import", async () => {
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            { name: "Ada One", email: "ada@example.com" },
            { name: "Ada Two", email: "ADA@example.com" },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 1,
      failed: 0,
    });
    expect(mockSupabaseState.inserts).toHaveLength(1);
    expect(
      mockSupabaseState.customers.filter(
        (customer) =>
          customer.shop_id === "shop-real" &&
          String(customer.email).toLowerCase() === "ada@example.com",
      ),
    ).toHaveLength(1);
  });

  it("updates an older same-shop customer matched by normalized external_id before email, phone, or name", async () => {
    mockSupabaseState.customers = [
      {
        id: "older-external-customer",
        shop_id: "shop-real",
        external_id: " cust-100011 ",
        business_name: null,
        email: null,
        name: null,
      },
      {
        id: "email-collision",
        shop_id: "shop-real",
        external_id: "CUST-OTHER",
        business_name: "Email Collision",
        email: "ada@example.com",
        name: "Email Collision",
      },
    ];

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            {
              external_id: "CUST-100011",
              business_name: "Ada Logistics",
              email: "ada@example.com",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.inserts).toHaveLength(0);
    expect(mockSupabaseState.updates[0]).toMatchObject({
      filters: { shop_id: "shop-real", id: "older-external-customer" },
      payload: expect.objectContaining({
        external_id: "CUST-100011",
        business_name: "Ada Logistics",
        email: "ada@example.com",
      }),
    });
  });

  it("prefetches beyond the first 1000 same-shop customers before matching external_id", async () => {
    mockSupabaseState.customers = Array.from({ length: 1205 }, (_, index) => ({
      id: `customer-${index}`,
      shop_id: "shop-real",
      external_id: `CUST-${String(index).padStart(6, "0")}`,
      created_at: `2026-04-${String((index % 28) + 1).padStart(2, "0")}`,
    }));

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            {
              external_id: "CUST-001200",
              business_name: "Customer 1200 Updated",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.customerSelects).toBe(2);
    expect(mockSupabaseState.inserts).toHaveLength(0);
    expect(mockSupabaseState.updates[0].filters).toMatchObject({
      shop_id: "shop-real",
      id: "customer-1200",
    });
  });

  it("dedupes repeated external_id values inside one CSV before insert", async () => {
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            { external_id: "CUST-100011", business_name: "Ada One" },
            { external_id: " cust-100011 ", business_name: "Ada Two" },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 1,
      failed: 0,
    });
    expect(mockSupabaseState.inserts).toHaveLength(1);
    expect(mockSupabaseState.inserts[0]).toMatchObject({
      shop_id: "shop-real",
      external_id: "CUST-100011",
      business_name: "Ada One",
    });
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("user_id");
    expect(payload.warnings[0]).toMatchObject({
      row: 2,
      reason:
        "Duplicate external_id already exists earlier in this import batch.",
    });
  });

  it("updates or skips a duplicate email in the same shop instead of failing", async () => {
    mockSupabaseState.customers = [
      {
        id: "customer-email",
        shop_id: "shop-real",
        email: "ada@example.com",
        name: "Ada Old",
      },
    ];

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [{ name: "Ada Lovelace", email: "ada@example.com" }],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.inserts).toHaveLength(0);
    expect(mockSupabaseState.updates[0].filters).toMatchObject({
      shop_id: "shop-real",
      id: "customer-email",
    });
  });

  it("updates or skips a duplicate phone in the same shop instead of failing", async () => {
    mockSupabaseState.customers = [
      {
        id: "customer-phone",
        shop_id: "shop-real",
        phone: "(555) 111-2222",
        phone_number: "+1 555 111 2222",
        name: "Phone Existing",
      },
    ];

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [{ name: "Phone Updated", phone: "(555) 111-2222" }],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.inserts).toHaveLength(0);
    expect(mockSupabaseState.updates[0].filters).toMatchObject({
      shop_id: "shop-real",
      id: "customer-phone",
    });
  });

  it("does not update a duplicate customer from another shop", async () => {
    mockSupabaseState.customers = [
      {
        id: "other-shop-customer",
        shop_id: "shop-other",
        email: "ada@example.com",
        name: "Other Shop Ada",
      },
    ];

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [{ name: "Ada Lovelace", email: "ada@example.com" }],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.updates).toHaveLength(0);
    expect(mockSupabaseState.inserts[0]).toMatchObject({
      shop_id: "shop-real",
      email: "ada@example.com",
    });
  });

  it("handles a duplicate constraint 409 gracefully without failing the batch", async () => {
    mockSupabaseState.insertError = () => ({
      code: "23505",
      status: 409,
      message:
        'duplicate key value violates unique constraint "customers_shop_email_uq"',
    });

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [{ name: "Ada Lovelace", email: "ada@example.com" }],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 0,
      updated: 0,
      skipped: 1,
      failed: 0,
    });
    expect(payload.warnings[0]).toMatchObject({
      row: 1,
      code: "23505",
      constraint: "customers_shop_email_uq",
    });
  });

  it("recovers a batch insert conflict by falling back only to rows in that batch", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabaseState.insertError = (payload) =>
      Array.isArray(payload)
        ? {
            code: "23505",
            status: 409,
            message:
              'duplicate key value violates unique constraint "customers_shop_email_uq"',
          }
        : null;

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            { name: "Ada Lovelace", email: "ada@example.com" },
            { name: "Grace Hopper", email: "grace@example.com" },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({
      created: 2,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.inserts).toHaveLength(2);
    expect(mockSupabaseState.inserts.every((row) => !("user_id" in row))).toBe(
      true,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[customers-import] batch import issue",
      expect.objectContaining({
        rowRange: "1-2",
        code: "23505",
        status: 409,
        constraint: "customers_shop_email_uq",
        containsUserId: false,
        payloadKeyList: expect.arrayContaining(["email", "shop_id", "name"]),
      }),
    );
    warnSpy.mockRestore();
  });

  it("does not trigger customers_user_id_uq during normal imports because user_id is omitted", async () => {
    mockSupabaseState.insertError = (payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      if (rows.some((row) => Object.hasOwn(row, "user_id"))) {
        return {
          code: "23505",
          status: 409,
          message:
            'duplicate key value violates unique constraint "customers_user_id_uq"',
        };
      }
      return null;
    };

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            { name: "Ada Lovelace", email: "ada@example.com" },
            { name: "Grace Hopper", email: "grace@example.com" },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 2,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.inserts).toHaveLength(2);
    expect(mockSupabaseState.inserts.every((row) => !("user_id" in row))).toBe(
      true,
    );
  });

  it("recovers safely if customers_user_id_uq is unexpectedly returned", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabaseState.insertError = () => ({
      code: "23505",
      status: 409,
      message:
        'duplicate key value violates unique constraint "customers_user_id_uq"',
    });

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [{ name: "Ada Lovelace", email: "ada@example.com" }],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({
      created: 0,
      updated: 0,
      skipped: 1,
      failed: 0,
    });
    expect(payload.warnings[0]).toMatchObject({
      row: 1,
      code: "23505",
      status: 409,
      constraint: "customers_user_id_uq",
      reason:
        "CSV import unexpectedly hit customers_user_id_uq even though customer user_id is not set; row skipped for safe recovery.",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[customers-import] row import issue",
      expect.objectContaining({
        row: 1,
        context: "single-insert-fallback",
        code: "23505",
        status: 409,
        constraint: "customers_user_id_uq",
        containsUserId: false,
        payloadKeyList: expect.not.arrayContaining(["user_id"]),
      }),
    );
    warnSpy.mockRestore();
  });

  it("prefetches same-shop customers once for a large import instead of per row", async () => {
    const rows = Array.from({ length: 600 }, (_, index) => ({
      name: `Customer ${index}`,
      email: `customer-${index}@example.com`,
    }));

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 600,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.profileSelects).toBe(1);
    expect(mockSupabaseState.customerSelects).toBe(1);
    expect(mockSupabaseState.inserts).toHaveLength(600);
    expect(mockSupabaseState.inserts.every((row) => !("user_id" in row))).toBe(
      true,
    );
  });

  it("skips an unsafe duplicate constraint during update instead of failing the batch", async () => {
    mockSupabaseState.customers = [
      {
        id: "customer-email",
        shop_id: "shop-real",
        email: "ada@example.com",
        name: "Ada Old",
      },
    ];
    mockSupabaseState.updateError = () => ({
      code: "23505",
      status: 409,
      message:
        'duplicate key value violates unique constraint "customers_shop_email_uq"',
    });

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [{ name: "Ada Lovelace", email: "ada@example.com" }],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 0,
      updated: 0,
      skipped: 1,
      failed: 0,
    });
    expect(payload.warnings[0]).toMatchObject({
      row: 1,
      reason:
        "Existing customer update hit a duplicate constraint; the row was skipped to avoid merging unsafe data.",
    });
  });

  it("returns useful counts for a mixed file with created rows and duplicates", async () => {
    mockSupabaseState.customers = [
      {
        id: "existing-email",
        shop_id: "shop-real",
        email: "existing@example.com",
        name: "Existing",
      },
      {
        id: "existing-phone",
        shop_id: "shop-real",
        phone: "5551112222",
        phone_number: "5551112222",
        name: "Phone",
      },
    ];

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            { name: "New Customer", email: "new@example.com" },
            { name: "Existing Updated", email: "existing@example.com" },
            { name: "Phone Updated", phone: "555-111-2222" },
            { notes: "missing identity" },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 1,
      updated: 2,
      skipped: 1,
      failed: 0,
    });
    expect(payload.warnings[0]).toMatchObject({
      row: 4,
      reason: "Missing customer identity fields.",
    });
  });

  it("recovers from a race-condition duplicate insert by re-querying and updating the same-shop match", async () => {
    mockSupabaseState.insertError = (payload) => {
      mockSupabaseState.customers.push({
        id: "raced-customer",
        ...payload,
        name: "Race Existing",
      });
      return {
        code: "23505",
        status: 409,
        message:
          'duplicate key value violates unique constraint "customers_shop_email_uq"',
      };
    };

    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [{ name: "Race Updated", email: "race@example.com" }],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.counts).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(mockSupabaseState.updates[0].filters).toMatchObject({
      shop_id: "shop-real",
      id: "raced-customer",
    });
  });

  it("returns successful created and updated counts", async () => {
    mockSupabaseState.customers = [
      { id: "customer-1", shop_id: "shop-real", email: "existing@example.com" },
    ];
    const response = await importCustomers(
      new Request("http://localhost/api/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            {
              first_name: "Ada",
              last_name: "Lovelace",
              email: "ada@example.com",
            },
            {
              name: "Existing Customer",
              email: "existing@example.com",
              phone: "555-111-2222",
            },
            { notes: "blank row" },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(payload).toMatchObject({
      ok: true,
      counts: { created: 1, updated: 1, skipped: 1, failed: 0 },
    });
    expect(mockSupabaseState.inserts).toHaveLength(1);
    expect(mockSupabaseState.updates).toHaveLength(1);
    expect(mockSupabaseState.updates[0].filters).toMatchObject({
      shop_id: "shop-real",
      id: "customer-1",
    });
  });
});
