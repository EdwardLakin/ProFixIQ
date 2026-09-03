import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@shared/types/types/supabase";
import { resolveShopProductAccess } from "@/features/shared/lib/product-access";

function clientWithResults(
  results: Array<{ data: boolean | null; error: { message: string } | null }>,
) {
  const rpc = vi.fn();
  for (const result of results) rpc.mockResolvedValueOnce(result);
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
}

describe("resolveShopProductAccess", () => {
  it("uses the existing entitlement RPC for each requested capability", async () => {
    const { client, rpc } = clientWithResults([
      { data: false, error: null },
      { data: true, error: null },
    ]);

    await expect(
      resolveShopProductAccess({
        supabase: client,
        shopId: "shop-1",
        capabilities: ["shop", "field_service"],
      }),
    ).resolves.toEqual({ entitled: true, error: null });
    expect(rpc).toHaveBeenNthCalledWith(1, "profixiq_shop_has_product_access", {
      p_capability: "shop",
      p_shop_id: "shop-1",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "profixiq_shop_has_product_access", {
      p_capability: "field_service",
      p_shop_id: "shop-1",
    });
  });

  it("distinguishes a resolved denial from an entitlement lookup failure", async () => {
    const denied = clientWithResults([{ data: false, error: null }]);
    await expect(
      resolveShopProductAccess({
        supabase: denied.client,
        shopId: "shop-1",
        capabilities: ["shop"],
      }),
    ).resolves.toEqual({ entitled: false, error: null });

    const unavailable = clientWithResults([
      { data: null, error: { message: "database unavailable" } },
    ]);
    await expect(
      resolveShopProductAccess({
        supabase: unavailable.client,
        shopId: "shop-1",
        capabilities: ["shop"],
      }),
    ).resolves.toEqual({
      entitled: false,
      error: "database unavailable",
    });
  });
});
