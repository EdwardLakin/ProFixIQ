import { describe, expect, it, vi } from "vitest";

// seedDemoShopFixtures seeds the standard demo baseline (customers,
// vehicles, work orders, lines, inspections) into a freshly cloned
// per-prospect shop, attributed to the prospect's own owner profile. The
// one safety property worth a dedicated regression: it must never call
// mutate_work_order_line_assignment_atomic (the canonical technician
// assignment path), since that RPC requires the assignee to already hold a
// technician-family role -- which a role='owner' prospect profile never
// has. See the module header in features/ops/server/demoShopFixtures.ts.

const SHOP_ID = "50505050-5050-4505-8505-505050505050";
const ACTOR_PROFILE_ID = "60606060-6060-4606-8606-606060606060";

function makeAlwaysNotFoundThenInsertedBuilder(table: string, idCounterRef: { n: number }) {
  const builder: Record<string, unknown> = {};
  // A fresh builder is created per admin.from(table) call, and
  // upsertByNaturalKey() calls admin.from(table) separately for the
  // natural-key lookup chain (select().eq()...maybeSingle()) and, when that
  // reports not-found, for the insert chain (insert().select().limit()
  // .maybeSingle()). Track which one this particular instance is on so
  // maybeSingle() can report "not found" for every lookup and only return
  // an id for an actual insert -- otherwise (returning an id
  // unconditionally) every lookup would report a false hit, the insert
  // branch in upsertByNaturalKey() would never run, and this test would
  // pass vacuously even if seedDemoShopFixtures never inserted anything.
  let isInsert = false;
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.insert = vi.fn(() => {
    isInsert = true;
    return builder;
  });
  builder.limit = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => {
    if (!isInsert) {
      // Natural-key lookup: always reports "not found" so every row goes
      // through the insert branch.
      return Promise.resolve({ data: null, error: null });
    }
    idCounterRef.n += 1;
    return Promise.resolve({ data: { id: `${table}-${idCounterRef.n}` }, error: null });
  });
  return builder;
}

function createFixtureAdminMock() {
  const idCounterRef = { n: 0 };
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn((table: string) => makeAlwaysNotFoundThenInsertedBuilder(table, idCounterRef));
  return { from, rpc };
}

describe("seedDemoShopFixtures", () => {
  it("never assigns a technician (the prospect owner never qualifies for the role-gated assignment RPC)", async () => {
    const admin = createFixtureAdminMock();
    const { seedDemoShopFixtures } = await import("@/features/ops/server/demoShopFixtures");

    const counts = await seedDemoShopFixtures({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      shopId: SHOP_ID,
      actorProfileId: ACTOR_PROFILE_ID,
    });

    expect(admin.rpc).not.toHaveBeenCalled();
    expect(counts).toEqual({
      customerCount: 3,
      vehicleCount: 10,
      workOrderCount: 7,
      workOrderLineCount: 7,
      inspectionCount: 2,
    });
  });

  it("attributes every seeded row to the prospect's own profile, never a hardcoded persona id", async () => {
    const admin = createFixtureAdminMock();
    const insertedPayloads: Record<string, unknown>[] = [];
    const originalFrom = admin.from;
    admin.from = vi.fn((table: string) => {
      const builder = originalFrom(table) as Record<string, unknown>;
      const originalInsert = builder.insert as (payload: unknown) => unknown;
      builder.insert = vi.fn((payload: Record<string, unknown>) => {
        insertedPayloads.push({ table, ...payload });
        return originalInsert(payload);
      });
      return builder;
    });

    const { seedDemoShopFixtures } = await import("@/features/ops/server/demoShopFixtures");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await seedDemoShopFixtures({ admin: admin as any, shopId: SHOP_ID, actorProfileId: ACTOR_PROFILE_ID });

    const actorFields = ["user_id", "assigned_tech"];
    for (const payload of insertedPayloads) {
      for (const field of actorFields) {
        if (field in payload) {
          expect([ACTOR_PROFILE_ID, null]).toContain(payload[field]);
        }
      }
      expect(payload.shop_id).toBe(SHOP_ID);
    }
  });
});
