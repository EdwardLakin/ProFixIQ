import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    email: "customer@example.test",
  },
  profile: null as null | { id: string; shop_id: string; role: string },
  replay: null as unknown,
  rpc: vi.fn(),
  triage: vi.fn(),
  deliver: vi.fn(),
  portal: vi.fn(),
  access: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.profile, error: null }),
        }),
      }),
    }),
  }),
  createAdminSupabase: () => ({
    rpc: mocks.rpc,
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: mocks.replay, error: null }),
        limit: async () => ({ data: [], error: null }),
      };
      return chain;
    },
  }),
}));
vi.mock("@/features/portal/server/portalAuth", () => ({
  requirePortalCustomerAccess: mocks.portal,
  PortalAccessError: class extends Error {
    status = 403;
  },
}));
vi.mock("@/features/feedback/server/triageFeedback", () => ({
  triageFeedback: mocks.triage,
}));
vi.mock("@/features/feedback/server/delivery", () => ({
  deliverFeedbackNotifications: mocks.deliver,
}));
vi.mock("@/features/ops/server/operator-access", () => ({
  requireOpsOperatorApiAccess: mocks.access,
}));
import { POST } from "../app/api/feedback/route";
import { PATCH } from "../app/api/feedback/[id]/route";

const id = "00000000-0000-0000-0000-000000000002";
const request = (body: unknown) =>
  new NextRequest("https://example.test/api/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile = null;
  mocks.replay = null;
  mocks.access.mockResolvedValue({ ok: true });
  mocks.portal.mockResolvedValue({ customer: { shop_id: id } });
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "feedback_ready"
      ? { data: true, error: null }
      : {
          data: { submissionId: id, clusterId: id, replayed: false },
          error: null,
        },
  );
  mocks.deliver.mockResolvedValue({
    notified: 0,
    pendingNotifications: 1,
    unknownNotifications: 0,
  });
  mocks.triage.mockResolvedValue({
    mode: "fallback",
    model: null,
    output: {
      title: "Private title",
      summary: "Private customer details",
      kind: "other",
      surface: "customer_portal",
      severity: "normal",
      needsAttention: false,
      recommendation: "Review",
      duplicateOf: null,
      duplicateConfidence: null,
    },
  });
});
describe("feedback authorization and durable receipts", () => {
  it("denies a profile-less user without verified portal access", async () => {
    const { PortalAccessError } =
      await import("@/features/portal/server/portalAuth");
    mocks.portal.mockRejectedValue(new PortalAccessError("Forbidden", 403));
    expect(
      (await POST(request({ description: "x", submissionKey: "key" }))).status,
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("submits a verified profile-less portal identity without violating the profile FK", async () => {
    const response = await POST(
      request({ description: "Improve the portal", submissionKey: "portal-1" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.portal).toHaveBeenCalledWith(mocks.user.id, mocks.user.email);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_feedback",
      expect.objectContaining({
        p_submission: expect.objectContaining({
          reporterAuthId: mocks.user.id,
          profileId: null,
          shopId: id,
          role: "customer",
        }),
      }),
    );
    expect(await response.json()).toEqual({
      ok: true,
      submissionId: id,
      matchedExisting: false,
      replayed: false,
    });
  });
  it("resumes durable pending notifications on replay without another AI call or insert", async () => {
    mocks.replay = { id, normalized_json: {} };
    const response = await POST(
      request({ description: "Improve the portal", submissionKey: "portal-1" }),
    );
    expect((await response.json()).replayed).toBe(true);
    expect(mocks.triage).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("feedback_ready");
    expect(mocks.deliver).toHaveBeenCalledWith(expect.anything(), id, {
      owner: true,
    });
  });
  it("never returns cross-tenant model output even when triage matches another shop", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "feedback_ready"
        ? { data: true, error: null }
        : {
            data: {
              submissionId: id,
              clusterId: mocks.user.id,
              replayed: false,
            },
            error: null,
          },
    );
    const response = await POST(
      request({ description: "Improve it", submissionKey: "privacy-1" }),
    );
    expect(await response.json()).toEqual({
      ok: true,
      submissionId: id,
      matchedExisting: true,
      replayed: false,
    });
  });
  it("rejects oversized input, missing operation keys and forged screenshot ownership", async () => {
    for (const body of [
      { description: "x".repeat(12001), submissionKey: "key" },
      { description: "x" },
      {
        description: "x",
        submissionKey: "key",
        attachmentIds: [`${id}/other-shop.png`],
      },
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(mocks.triage).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("stops before AI while the ledger restriction or schema is not ready", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(
      (await POST(request({ description: "Improve it", submissionKey: "key" })))
        .status,
    ).toBe(503);
    expect(mocks.triage).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("accepts ordinary dotted screenshot filenames but rejects traversal segments", async () => {
    expect(
      (
        await POST(
          request({
            description: "x",
            submissionKey: "key",
            attachmentIds: [`${mocks.user.id}/screenshot..png`],
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await POST(
          request({
            description: "x",
            submissionKey: "key",
            attachmentIds: [`${mocks.user.id}/../other.png`],
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("does not acknowledge an uncommitted transaction", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "feedback_ready"
        ? { data: true, error: null }
        : { data: null, error: { code: "23503", message: "FK failure" } },
    );
    expect(
      (await POST(request({ description: "x", submissionKey: "key" }))).status,
    ).toBe(503);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});
describe("Ops lifecycle authorization, conflicts and completion recovery", () => {
  it("denies non-operators before any privileged mutation", async () => {
    mocks.access.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect(
      (await PATCH(request({}), { params: Promise.resolve({ id }) })).status,
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid lifecycle states rather than silently retaining the old status", async () => {
    expect(
      (
        await PATCH(
          request({
            status: "invented",
            expectedUpdatedAt: "2026-10-12T00:00:00Z",
          }),
          { params: Promise.resolve({ id }) },
        )
      ).status,
    ).toBe(400);
  });
  it("returns an actionable conflict and sends no emails when the atomic update loses", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    expect(
      (
        await PATCH(
          request({
            status: "completed",
            expectedUpdatedAt: "2026-10-12T00:00:00Z",
            notifyRequesters: true,
          }),
          { params: Promise.resolve({ id }) },
        )
      ).status,
    ).toBe(409);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("retries completion recipients without reopening the lifecycle and reports pending failures", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "completed" }, error: null });
    const response = await PATCH(
      request({
        expectedUpdatedAt: "2026-10-12T00:00:00Z",
        notifyRequesters: true,
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(await response.json()).toEqual({
      ok: true,
      status: "completed",
      notified: 0,
      pendingNotifications: 1,
      unknownNotifications: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_feedback",
      expect.objectContaining({ p_patch: {} }),
    );
    expect(mocks.deliver).toHaveBeenCalledWith(expect.anything(), id, {
      owner: true,
      requesters: true,
      retryUnknown: false,
    });
  });
});
