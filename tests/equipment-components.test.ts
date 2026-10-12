import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/equipment/server/equipmentAssetProfileService", () => ({
  authorizeEquipmentAsset: mocks.authorize,
  EquipmentAssetProfileError: class extends Error {},
}));

import {
  buildComponentTree,
  componentTemplateForClass,
  validateComponentAction,
  validateComponentFields,
  type EquipmentComponent,
} from "@/features/equipment/lib/components";
import {
  applyComponentAction,
  componentHours,
  createComponent,
  EquipmentComponentError,
  seedStandardComponents,
} from "@/features/equipment/server/equipmentComponentService";

const SHOP = "00000000-0000-4000-8000-000000000111";
const USER = "00000000-0000-4000-8000-000000000222";
const COMPONENT = "00000000-0000-4000-8000-000000000444";
const ASSET_A = "00000000-0000-4000-8000-000000000001";
const ASSET_B = "00000000-0000-4000-8000-000000000002";
const KEY = "00000000-0000-4000-8000-0000000000aa";

describe("component validation", () => {
  it("requires a recognized type and position", () => {
    expect(validateComponentFields({}).ok).toBe(false);
    expect(validateComponentFields({ componentType: "flux_capacitor" }).ok).toBe(false);
    expect(validateComponentFields({ componentType: "engine", position: "upside" }).ok).toBe(false);
  });

  it("defaults the name from type and position and trims text", () => {
    const result = validateComponentFields({
      componentType: "final_drive",
      position: "left",
      serialNumber: "  FD-123 ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.label).toMatch(/final drive/i);
    expect(result.value.serialNumber).toBe("FD-123");
  });

  it("rejects non-scalar attributes", () => {
    expect(
      validateComponentFields({ componentType: "engine", attributes: { arrangement: { nested: 1 } } }).ok,
    ).toBe(false);
  });

  it("requires an asset to install and rejects future dates and malformed ids", () => {
    expect(validateComponentAction({ action: "install" }).ok).toBe(false);
    expect(validateComponentAction({ action: "teleport" }).ok).toBe(false);
    expect(validateComponentAction({ action: "repaired", workOrderId: "nope" }).ok).toBe(false);
    expect(
      validateComponentAction({
        action: "inspected",
        occurredAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      }).ok,
    ).toBe(false);
    const ok = validateComponentAction({ action: "install", assetId: ASSET_A, position: "left", operationKey: KEY });
    expect(ok.ok && ok.value).toMatchObject({ action: "install", assetId: ASSET_A, position: "left" });
  });

  it("only lets remove target stock or repair", () => {
    const result = validateComponentAction({ action: "remove", targetStatus: "scrapped", operationKey: KEY });
    expect(result.ok && result.value.targetStatus).toBe("in_stock");
  });
});

describe("standard component templates", () => {
  it("gives a crawler excavator both undercarriage sides, parents before children", () => {
    const items = componentTemplateForClass("crawler_excavator");
    const keys = items.map((item) => item.key);
    expect(keys).toContain("undercarriage.left");
    expect(keys).toContain("undercarriage.left.track_chain.left");
    for (const item of items) {
      if (item.parentKey) expect(keys.indexOf(item.parentKey)).toBeLessThan(keys.indexOf(item.key));
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps (type, position) unique in every template so seeding stays idempotent", () => {
    for (const equipmentClass of [
      "crawler_excavator",
      "wheel_loader",
      "crawler_dozer",
      "motor_grader",
      "articulated_dump_truck",
      "telehandler",
      "roller_compactor",
      null,
    ]) {
      const pairs = componentTemplateForClass(equipmentClass).map(
        (item) => `${item.componentType}:${item.position ?? ""}`,
      );
      expect(new Set(pairs).size).toBe(pairs.length);
    }
  });

  it("drops undercarriage for wheeled machines and returns nothing for attachments", () => {
    expect(componentTemplateForClass("wheeled_excavator").some((item) => item.componentType === "undercarriage")).toBe(false);
    expect(componentTemplateForClass("attachment")).toEqual([]);
    expect(componentTemplateForClass(null).map((item) => item.componentType)).toContain("engine");
  });
});

function component(id: string, parentComponentId: string | null, displayName: string): EquipmentComponent {
  return {
    id,
    componentType: "engine",
    position: null,
    label: displayName,
    displayName,
    manufacturer: null,
    model: null,
    serialNumber: null,
    partNumber: null,
    status: "installed",
    installedAssetId: ASSET_A,
    parentComponentId,
    installedAt: null,
    componentHours: null,
    attributes: {},
    lastEvent: null,
  };
}

describe("component tree and life", () => {
  it("nests children and keeps orphans at the root", () => {
    const tree = buildComponentTree([
      component("b", "a", "Turbo"),
      component("a", null, "Engine"),
      component("c", "missing", "Orphan"),
    ]);
    expect(tree.map((node) => node.displayName)).toEqual(["Engine", "Orphan"]);
    expect(tree[0].children.map((node) => node.displayName)).toEqual(["Turbo"]);
  });

  it("adds asset hours since install to life at install", () => {
    const row = { status: "installed", installed_asset_hours: 1000, component_hours_at_install: 250 };
    expect(componentHours(row, 1600)).toBe(850);
    // A meter that went backwards (replacement / correction) is not guessed at.
    expect(componentHours(row, 900)).toBe(250);
    expect(componentHours({ ...row, status: "in_stock" }, 1600)).toBe(250);
  });
});

type Rpc = { name: string; args: Record<string, unknown> };

function fakeAdmin(rows: Record<string, Record<string, unknown> | null>, rpcs: Rpc[], rpcResult: unknown = null) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return rpcResult instanceof Error
        ? { data: null, error: { code: (rpcResult as Error & { code: string }).code, message: rpcResult.message } }
        : { data: rpcResult, error: null };
    },
  };
}

function context(admin: unknown) {
  return {
    supabase: {} as never,
    admin: admin as never,
    shopId: SHOP,
    role: "manager" as const,
    actorUserId: USER,
  };
}

const installedOnA = {
  id: COMPONENT,
  shop_id: SHOP,
  status: "installed",
  installed_vehicle_id: ASSET_A,
  installed_asset_hours: 1000,
  component_hours_at_install: 500,
};

describe("component actions", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.authorize.mockImplementation(async ({ assetId }: { assetId: string }) => ({
      id: assetId,
      engineHours: assetId === ASSET_A ? 1400 : 7000,
    }));
  });

  it("moving between assets carries life measured on the old asset's meter", async () => {
    const rpcs: Rpc[] = [];
    await applyComponentAction({
      ...context(fakeAdmin({ equipment_components: installedOnA }, rpcs)),
      componentId: COMPONENT,
      input: {
        action: "install",
        assetId: ASSET_B,
        parentComponentId: null,
        position: null,
        occurredAt: null,
        workOrderId: null,
        notes: null,
        targetStatus: "in_stock",
        operationKey: KEY,
      },
    });
    expect(mocks.authorize.mock.calls.map(([call]) => call.assetId)).toEqual([ASSET_A, ASSET_B]);
    expect(rpcs[0].name).toBe("equipment_component_move");
    expect(rpcs[0].args).toMatchObject({
      p_shop_id: SHOP,
      p_actor_user_id: USER,
      p_vehicle_id: ASSET_B,
      p_asset_hours: 7000,
      // Life on the old asset is measured with the old asset's own meter.
      p_source_asset_hours: 1400,
      p_operation_key: KEY,
    });
  });

  it("refuses when the caller cannot see the target asset", async () => {
    mocks.authorize.mockImplementation(async ({ assetId }: { assetId: string }) =>
      assetId === ASSET_B ? null : { id: assetId, engineHours: 1400 },
    );
    const rpcs: Rpc[] = [];
    await expect(
      applyComponentAction({
        ...context(fakeAdmin({ equipment_components: installedOnA }, rpcs)),
        componentId: COMPONENT,
        input: {
          action: "install",
          assetId: ASSET_B,
          parentComponentId: null,
          position: null,
          occurredAt: null,
          workOrderId: null,
          notes: null,
          targetStatus: "in_stock",
          operationKey: KEY,
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(rpcs).toEqual([]);
  });

  it("rejects removing a component that is not installed", async () => {
    const rpcs: Rpc[] = [];
    await expect(
      applyComponentAction({
        ...context(fakeAdmin({ equipment_components: { ...installedOnA, status: "in_stock", installed_vehicle_id: null } }, rpcs)),
        componentId: COMPONENT,
        input: {
          action: "remove",
          assetId: null,
          parentComponentId: null,
          position: null,
          occurredAt: null,
          workOrderId: null,
          notes: null,
          targetStatus: "in_repair",
          operationKey: KEY,
        },
      }),
    ).rejects.toBeInstanceOf(EquipmentComponentError);
    expect(rpcs).toEqual([]);
  });

  it("maps a duplicate serial to a conflict", async () => {
    const duplicate = Object.assign(new Error("duplicate key"), { code: "23505" });
    await expect(
      applyComponentAction({
        ...context(fakeAdmin({ equipment_components: installedOnA }, [], duplicate)),
        componentId: COMPONENT,
        input: {
          action: "rebuilt",
          assetId: null,
          parentComponentId: null,
          position: null,
          occurredAt: null,
          workOrderId: null,
          notes: null,
          targetStatus: "in_stock",
          operationKey: KEY,
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("standard component seeding", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.authorize.mockResolvedValue({ id: ASSET_A, engineHours: 1400 });
  });

  it("requires an Equipment profile", async () => {
    await expect(
      seedStandardComponents({ ...context(fakeAdmin({}, [])), assetId: ASSET_A }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("sends the class template with parent keys and the asset meter", async () => {
    const rpcs: Rpc[] = [];
    const created = await seedStandardComponents({
      ...context(
        fakeAdmin({ equipment_asset_profiles: { equipment_class: "crawler_dozer" } }, rpcs, 12),
      ),
      assetId: ASSET_A,
    });
    expect(created).toBe(12);
    expect(rpcs[0].name).toBe("equipment_component_seed");
    expect(rpcs[0].args).toMatchObject({ p_vehicle_id: ASSET_A, p_asset_hours: 1400 });
    const items = rpcs[0].args.p_items as Array<{ key: string; parent_key: string | null }>;
    expect(items.find((item) => item.key === "engine.turbocharger")?.parent_key).toBe("engine");
    expect(items.some((item) => item.key === "ripper")).toBe(true);
  });
});

describe("component creation", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.authorize.mockResolvedValue({ id: ASSET_A, engineHours: 1400 });
  });

  it("creates and installs in one retry-safe RPC with the asset meter", async () => {
    const rpcs: Rpc[] = [];
    const id = await createComponent({
      ...context(fakeAdmin({}, rpcs, COMPONENT)),
      fields: {
        componentType: "turbocharger",
        position: null,
        label: "Turbocharger",
        manufacturer: null,
        model: null,
        serialNumber: null,
        partNumber: null,
        attributes: {},
      },
      install: { assetId: ASSET_A, parentComponentId: COMPONENT },
      operationKey: KEY,
    });
    expect(id).toBe(COMPONENT);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({
      name: "equipment_component_save",
      args: {
        p_component_id: null,
        p_install_vehicle_id: ASSET_A,
        p_parent_component_id: COMPONENT,
        p_asset_hours: 1400,
        p_operation_key: KEY,
      },
    });
  });
});

describe("technician work recording", () => {
  const work = (action: "repaired" | "install", patch: Partial<Record<string, unknown>> = {}) => ({
    action,
    assetId: action === "install" ? ASSET_B : null,
    parentComponentId: null,
    position: null,
    occurredAt: null,
    workOrderId: null,
    notes: null,
    targetStatus: "in_stock" as const,
    operationKey: KEY,
    ...patch,
  });

  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.authorize.mockImplementation(async ({ assetId }: { assetId: string }) => ({
      id: assetId,
      engineHours: 1400,
    }));
  });

  it("lets an assigned mechanic record work on an installed component", async () => {
    const rpcs: Rpc[] = [];
    await applyComponentAction({
      ...context(fakeAdmin({ equipment_components: installedOnA }, rpcs)),
      role: "mechanic",
      componentId: COMPONENT,
      input: work("repaired") as never,
    });
    expect(mocks.authorize).toHaveBeenCalledWith(expect.objectContaining({ role: "mechanic", assetId: ASSET_A }));
    expect(rpcs[0].args).toMatchObject({ p_action: "repaired", p_asset_hours: 1400 });
  });

  it("refuses moves by mechanics and work on components off the machine", async () => {
    await expect(
      applyComponentAction({
        ...context(fakeAdmin({ equipment_components: installedOnA }, [])),
        role: "mechanic",
        componentId: COMPONENT,
        input: work("install") as never,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      applyComponentAction({
        ...context(
          fakeAdmin({ equipment_components: { ...installedOnA, status: "in_stock", installed_vehicle_id: null } }, []),
        ),
        role: "mechanic",
        componentId: COMPONENT,
        input: work("repaired") as never,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a work order for a different asset", async () => {
    const rpcs: Rpc[] = [];
    const supabase = {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: { id: KEY, vehicle_id: ASSET_B }, error: null }),
        };
        return builder;
      },
    };
    await expect(
      applyComponentAction({
        ...context(fakeAdmin({ equipment_components: installedOnA }, rpcs)),
        supabase: supabase as never,
        componentId: COMPONENT,
        input: work("repaired", { workOrderId: "00000000-0000-4000-8000-000000000999" }) as never,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(rpcs).toEqual([]);
  });
});

describe("dates, keys and electric equipment", () => {
  it("keeps a date-only value on the chosen calendar day", () => {
    const result = validateComponentAction({ action: "inspected", occurredAt: "2026-10-01", operationKey: KEY });
    expect(result.ok && result.value.occurredAt).toBe("2026-10-01T12:00:00.000Z");
  });

  it("requires an operation key for actions", () => {
    expect(validateComponentAction({ action: "inspected" }).ok).toBe(false);
  });

  it("does not seed combustion engines on electric machines", () => {
    for (const equipmentClass of ["scissor_lift", "vertical_mast_lift", "electric_rope_shovel"]) {
      const types = componentTemplateForClass(equipmentClass).map((item) => item.componentType);
      expect(types).not.toContain("engine");
      expect(types).not.toContain("turbocharger");
      expect(types).toContain("traction_motor");
    }
    expect(componentTemplateForClass("boom_lift").map((item) => item.componentType)).toContain("engine");
  });
});
