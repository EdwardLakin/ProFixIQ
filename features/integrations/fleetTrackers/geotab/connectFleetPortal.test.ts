import { describe, expect, it, vi } from "vitest";
import { connectFleetPortalGeotab } from "./connectFleetPortal";

describe("connectFleetPortalGeotab", () => {
  it("rejects a connect attempt without ever calling Geotab when a field is missing", async () => {
    const supabase = {
      from: vi.fn(),
    } as unknown as Parameters<typeof connectFleetPortalGeotab>[0];

    const result = await connectFleetPortalGeotab(supabase, {
      fleetId: "fleet-1",
      shopId: "shop-1",
      actorId: "user-1",
      database: "mycompany",
      username: "",
      password: "secret",
    });

    expect(result).toEqual({
      ok: false,
      error: "Database, username, and password are all required.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
