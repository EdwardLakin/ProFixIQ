import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteRows: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  maybeSingle: vi.fn(),
  requireAccess: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: mocks.from }),
}));

import { PATCH, POST } from "../app/api/inspections/templates/route";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const TEMPLATE_ID = "00000000-0000-4000-8000-000000000333";

const sections = [
  { title: "Brakes", items: [{ item: "Inspect brake hoses" }] },
];

const chain = {
  delete: mocks.deleteRows,
  eq: mocks.eq,
  insert: mocks.insert,
  maybeSingle: mocks.maybeSingle,
  select: mocks.select,
  update: mocks.update,
};

function request(method: "POST" | "PATCH", templateId?: string) {
  return new Request("http://localhost/api/inspections/templates", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(templateId ? { templateId } : {}),
      templateName: "Shop inspection",
      sections,
      vehicleType: "truck",
      laborHours: 1,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue(chain);
  mocks.insert.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  mocks.deleteRows.mockReturnValue(chain);
  mocks.eq.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.maybeSingle.mockResolvedValue({ data: { id: TEMPLATE_ID }, error: null });
  mocks.requireAccess.mockResolvedValue({
    ok: true,
    authUserId: USER_ID,
    profile: { id: USER_ID, shop_id: SHOP_ID, role: "owner" },
    supabase: { from: vi.fn() },
  });
});

describe("Shop inspection-template server route", () => {
  it("derives shop and owner scope server-side when creating", async () => {
    const response = await POST(request("POST"));

    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        shop_id: SHOP_ID,
        user_id: USER_ID,
        template_name: "Shop inspection",
        sections,
      }),
    );
  });

  it("preserves own-template and tenant scope when updating", async () => {
    const response = await PATCH(request("PATCH", TEMPLATE_ID));

    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", TEMPLATE_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "shop_id", SHOP_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(3, "user_id", USER_ID);
  });

  it("does not touch the database when authorization fails", async () => {
    mocks.requireAccess.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const response = await POST(request("POST"));

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
