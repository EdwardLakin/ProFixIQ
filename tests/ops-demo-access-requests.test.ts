import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Landing-page "Request Demo Access" intake queue: a public, unauthenticated
// submission only ever writes to demo_access_requests -- it never creates a
// shop, profile, or auth user itself. An ops operator reviews each request
// from /ops/demo-access and approves (which reuses the existing, already
// safety-checked createDemoProspect() flow) or dismisses it.

type MockResult = { data?: unknown; error?: unknown };

function makeBuilder(result: MockResult) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.gte = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.returns = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: (value: MockResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function createAdminMock(routes: Record<string, MockResult[]>) {
  const from = vi.fn((table: string) => {
    const queue = routes[table];
    const result = queue?.shift() ?? { data: null, error: null };
    return makeBuilder(result);
  });
  return { from };
}

const createAdminSupabaseMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

const createDemoProspectMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/ops/server/demoAccess", () => ({
  createDemoProspect: createDemoProspectMock,
}));

const REQUEST_ID = "40404040-4040-4404-8404-404040404040";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitDemoAccessRequest — public intake", () => {
  it("silently succeeds without writing anything when the honeypot field is filled", async () => {
    const { submitDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      submitDemoAccessRequest({
        fullName: "Bot Name",
        email: "bot@example.com",
        website: "https://spam.example",
      }),
    ).resolves.toBeUndefined();
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });

  it("rejects a missing name", async () => {
    createAdminSupabaseMock.mockReturnValue(createAdminMock({}));
    const { submitDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      submitDemoAccessRequest({ fullName: "   ", email: "jordan@example.com" }),
    ).rejects.toThrow("Name is required.");
  });

  it("rejects an invalid email", async () => {
    createAdminSupabaseMock.mockReturnValue(createAdminMock({}));
    const { submitDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      submitDemoAccessRequest({ fullName: "Jordan Ramirez", email: "not-an-email" }),
    ).rejects.toThrow("Enter a valid email address.");
  });

  it("inserts a pending request for valid, non-duplicate input", async () => {
    const admin = createAdminMock({
      demo_access_requests: [{ data: [], error: null }, { data: null, error: null }],
    });
    createAdminSupabaseMock.mockReturnValue(admin);
    const { submitDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      submitDemoAccessRequest({ fullName: "Jordan Ramirez", email: "Jordan@Example.com" }),
    ).resolves.toBeUndefined();

    const demoRequestCalls = admin.from.mock.calls.filter((call) => call[0] === "demo_access_requests");
    expect(demoRequestCalls).toHaveLength(2); // cooldown check, then insert
  });

  it("does not insert a duplicate when the same email requested within the cooldown window", async () => {
    const admin = createAdminMock({
      demo_access_requests: [{ data: [{ id: "existing" }], error: null }],
    });
    createAdminSupabaseMock.mockReturnValue(admin);
    const { submitDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      submitDemoAccessRequest({ fullName: "Jordan Ramirez", email: "jordan@example.com" }),
    ).resolves.toBeUndefined();

    const demoRequestCalls = admin.from.mock.calls.filter((call) => call[0] === "demo_access_requests");
    expect(demoRequestCalls).toHaveLength(1); // cooldown check only, no insert
  });
});

describe("listDemoAccessRequests", () => {
  it("maps snake_case rows to the camelCase DemoAccessRequest shape", async () => {
    // Pending/provisioning and approved/dismissed are queried separately
    // (in that order) so a page of reviewed history can never push a
    // pending request out of view.
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        demo_access_requests: [
          {
            data: [
              {
                id: REQUEST_ID,
                full_name: "Jordan Ramirez",
                email: "jordan@example.com",
                company_name: "Ramirez Diesel",
                message: "Interested in inspections",
                status: "pending",
                created_at: "2026-01-01T00:00:00.000Z",
                reviewed_at: null,
              },
            ],
            error: null,
          },
          { data: [], error: null },
        ],
      }),
    );
    const { listDemoAccessRequests } = await import("@/features/ops/server/demoAccessRequests");

    await expect(listDemoAccessRequests()).resolves.toEqual([
      {
        id: REQUEST_ID,
        fullName: "Jordan Ramirez",
        email: "jordan@example.com",
        companyName: "Ramirez Diesel",
        message: "Interested in inspections",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        reviewedAt: null,
      },
    ]);
  });
});

describe("approveDemoAccessRequest", () => {
  // approve claims the request with a conditional update
  // (status='pending' -> 'provisioning') before doing anything else, so two
  // concurrent approvals can never both provision an account: only one
  // update can match the eq("status", "pending") predicate. A claim that
  // matches no row (not found, or already reviewed/claimed) falls through
  // to a separate lookup that reports why.

  it("rejects a request id that does not exist", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        demo_access_requests: [
          { data: null, error: null }, // claim attempt matches no row
          { data: null, error: null }, // lookup: no such row
        ],
      }),
    );
    const { approveDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      approveDemoAccessRequest({ requestId: REQUEST_ID }, "operator-id"),
    ).rejects.toThrow("Demo access request not found.");
    expect(createDemoProspectMock).not.toHaveBeenCalled();
  });

  it("rejects a request that was already reviewed", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        demo_access_requests: [
          { data: null, error: null }, // claim attempt: not pending, matches no row
          { data: { status: "approved" }, error: null }, // lookup: already approved
        ],
      }),
    );
    const { approveDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      approveDemoAccessRequest({ requestId: REQUEST_ID }, "operator-id"),
    ).rejects.toThrow("This request is already approved.");
    expect(createDemoProspectMock).not.toHaveBeenCalled();
  });

  it("provisions the prospect via createDemoProspect and marks the request approved", async () => {
    createDemoProspectMock.mockResolvedValue({
      profileId: "new-profile-id",
      username: "jordan-ramirez",
      expiresAt: "2026-02-01T00:00:00.000Z",
    });
    const admin = createAdminMock({
      demo_access_requests: [
        { data: { id: REQUEST_ID, full_name: "Jordan Ramirez", email: "jordan@example.com" }, error: null }, // claim succeeds
        { data: null, error: null }, // final approved update
      ],
    });
    createAdminSupabaseMock.mockReturnValue(admin);
    const { approveDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      approveDemoAccessRequest({ requestId: REQUEST_ID, expiresAt: "2026-02-01T00:00:00.000Z" }, "operator-id"),
    ).resolves.toEqual({
      profileId: "new-profile-id",
      username: "jordan-ramirez",
      expiresAt: "2026-02-01T00:00:00.000Z",
    });

    expect(createDemoProspectMock).toHaveBeenCalledWith(
      { fullName: "Jordan Ramirez", email: "jordan@example.com", expiresAt: "2026-02-01T00:00:00.000Z" },
      "operator-id",
    );
  });

  it("releases the claim back to pending when createDemoProspect fails, so it can be retried", async () => {
    createDemoProspectMock.mockRejectedValue(new Error("Failed to seed shop membership: boom"));
    const admin = createAdminMock({
      demo_access_requests: [
        { data: { id: REQUEST_ID, full_name: "Jordan Ramirez", email: "jordan@example.com" }, error: null }, // claim succeeds
        { data: null, error: null }, // revert provisioning -> pending
      ],
    });
    createAdminSupabaseMock.mockReturnValue(admin);
    const { approveDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(
      approveDemoAccessRequest({ requestId: REQUEST_ID, expiresAt: "2026-02-01T00:00:00.000Z" }, "operator-id"),
    ).rejects.toThrow("Failed to seed shop membership: boom");

    const demoRequestCalls = admin.from.mock.calls.filter((call) => call[0] === "demo_access_requests");
    expect(demoRequestCalls).toHaveLength(2); // claim, then revert -- never the approved update
  });
});

describe("dismissDemoAccessRequest", () => {
  // dismiss is a single conditional update (matches status in
  // pending/provisioning), so it's race-safe against a concurrent
  // approve/dismiss the same way approve's claim step is.

  it("rejects a request id that does not exist", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        demo_access_requests: [
          { data: null, error: null }, // conditional update matches no row
          { data: null, error: null }, // lookup: no such row
        ],
      }),
    );
    const { dismissDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(dismissDemoAccessRequest({ requestId: REQUEST_ID }, "operator-id")).rejects.toThrow(
      "Demo access request not found.",
    );
  });

  it("marks a pending request dismissed", async () => {
    const admin = createAdminMock({
      demo_access_requests: [
        { data: { id: REQUEST_ID }, error: null }, // conditional update matches and succeeds
      ],
    });
    createAdminSupabaseMock.mockReturnValue(admin);
    const { dismissDemoAccessRequest } = await import("@/features/ops/server/demoAccessRequests");

    await expect(dismissDemoAccessRequest({ requestId: REQUEST_ID }, "operator-id")).resolves.toBeUndefined();
  });
});
