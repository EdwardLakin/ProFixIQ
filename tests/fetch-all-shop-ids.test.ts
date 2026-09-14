import { describe, expect, it, vi } from "vitest";

type ShopRow = { id: string; created_at: string };

type QueryNode = {
  select: (columns: string) => QueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => QueryNode;
  limit: (count: number) => QueryNode;
  or: (filter: string) => QueryNode;
  then: (
    resolve: (value: { data: ShopRow[] | undefined; error: unknown }) => unknown,
  ) => unknown;
};

function createShopsQuery(pages: ShopRow[][]) {
  const orCalls: string[] = [];

  function makePage(index: number): QueryNode {
    const rows = pages[index] ?? [];
    const node: QueryNode = {
      select: vi.fn(() => node),
      order: vi.fn(() => node),
      limit: vi.fn(() => node),
      or: vi.fn((filter: string) => {
        orCalls.push(filter);
        return makePage(index + 1);
      }),
      then: (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return node;
  }

  return { root: makePage(0), orCalls };
}

describe("fetchAllShopIds", () => {
  it("returns every shop id across a single page", async () => {
    const { root } = createShopsQuery([[{ id: "s1", created_at: "t1" }]]);
    const supabase = { from: vi.fn(() => root) };

    const { fetchAllShopIds } = await import("@/features/shared/lib/server/fetchAllShopIds");
    const ids = await fetchAllShopIds(supabase as never);

    expect(ids).toEqual(["s1"]);
  });

  it("does not skip shops that tie on created_at across a page boundary", async () => {
    // A full page all sharing the same created_at, then a tail page that
    // continues the tie. A strict created_at > cursor predicate would skip
    // every shop in the tail; the (created_at, id) keyset cursor must not.
    const tiedTimestamp = "2026-01-01T00:00:00.000Z";
    const firstPage: ShopRow[] = Array.from({ length: 500 }, (_, i) => ({
      id: `s${String(i).padStart(3, "0")}`,
      created_at: tiedTimestamp,
    }));
    const secondPage: ShopRow[] = [{ id: "s500", created_at: tiedTimestamp }];

    const { root, orCalls } = createShopsQuery([firstPage, secondPage]);
    const supabase = { from: vi.fn(() => root) };

    const { fetchAllShopIds } = await import("@/features/shared/lib/server/fetchAllShopIds");
    const ids = await fetchAllShopIds(supabase as never);

    expect(ids).toHaveLength(501);
    expect(ids).toContain("s500");
    expect(orCalls[0]).toContain(`created_at.eq.${tiedTimestamp}`);
    expect(orCalls[0]).toContain("id.gt.s499");
  });
});
