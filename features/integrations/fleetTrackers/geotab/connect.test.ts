import { describe, expect, it, vi } from "vitest";
import { connectGeotab } from "./connect";

describe("connectGeotab", () => {
  it("rejects a connect attempt without ever calling Geotab when a field is missing", async () => {
    const supabase = { from: vi.fn() } as never;

    const result = await connectGeotab(supabase, {
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
