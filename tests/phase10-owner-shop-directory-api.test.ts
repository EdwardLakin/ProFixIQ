import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  createAdmin: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));

import { GET } from "../app/api/admin/shops/route";

beforeEach(() => {
  mocks.requireAccess.mockReset();
  mocks.createAdmin.mockReset();
});

describe("Phase 10 owner shop directory API authorization", () => {
  it.each(["manager", "service_advisor"])(
    "returns a server-side 403 for %s access",
    async () => {
      mocks.requireAccess.mockResolvedValue({
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const response = await GET();

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
      expect(mocks.requireAccess).toHaveBeenCalledWith({
        allowRoles: ["owner", "admin"],
      });
      expect(mocks.createAdmin).not.toHaveBeenCalled();
    },
  );
});
