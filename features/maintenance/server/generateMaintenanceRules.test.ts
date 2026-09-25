import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB } from "./types";

const create = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/openai", () => ({
  openai: { chat: { completions: { create: (...args: unknown[]) => create(...args) } } },
}));
vi.mock("@/features/shared/lib/server/openai-models", () => ({
  getOpenAIModelForPurpose: () => "test-model",
  openAITemperatureParam: () => ({}),
}));

import { generateMaintenanceRulesForVehicle } from "./generateMaintenanceRules";

type Call = { table: string; method: string; args: unknown[] };

function makeClient(opts: { existingRules?: unknown[]; calls: Call[] }) {
  return {
    from: vi.fn((table: string) => {
      const builder = {
        select: (...args: unknown[]) => {
          opts.calls.push({ table, method: "select", args });
          return builder;
        },
        eq: (...args: unknown[]) => {
          opts.calls.push({ table, method: "eq", args });
          return builder;
        },
        is: (...args: unknown[]) => {
          opts.calls.push({ table, method: "is", args });
          return builder;
        },
        limit: () =>
          Promise.resolve({ data: opts.existingRules ?? [], error: null }),
        upsert: (...args: unknown[]) => {
          opts.calls.push({ table, method: "upsert", args });
          return Promise.resolve({ error: null });
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return builder;
    }),
  } as unknown as SupabaseClient<DB>;
}

const aiPayload = {
  services: [{ code: "tire_rotation", label: "Tire rotation", jobType: "maintenance", typicalHours: 0.5 }],
  rules: [{ serviceCode: "TIRE_ROTATION", distanceKmNormal: 10000 }],
};

describe("generateMaintenanceRulesForVehicle", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(aiPayload) } }],
    });
  });

  it("scopes the existing-schedule check to the engine family", async () => {
    const readCalls: Call[] = [];
    const supabase = makeClient({ existingRules: [{ id: "r1" }], calls: readCalls });

    await generateMaintenanceRulesForVehicle({
      supabase,
      year: 2019,
      make: "Ford",
      model: "F-150",
      engineFamily: "5.0L V8",
    });
    await generateMaintenanceRulesForVehicle({
      supabase,
      year: 2019,
      make: "Ford",
      model: "F-150",
      engineFamily: null,
    });

    expect(readCalls).toContainEqual({
      table: "maintenance_rules",
      method: "eq",
      args: ["engine_family", "5.0L V8"],
    });
    expect(readCalls).toContainEqual({
      table: "maintenance_rules",
      method: "is",
      args: ["engine_family", null],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("writes through the write client with conflict-safe upserts and a bounded provider call", async () => {
    const readCalls: Call[] = [];
    const writeCalls: Call[] = [];
    const supabase = makeClient({ calls: readCalls });
    const writeClient = makeClient({ calls: writeCalls });

    const result = await generateMaintenanceRulesForVehicle({
      supabase,
      writeClient,
      year: 2019,
      make: "Manac",
      model: "Flatbed",
      timeoutMs: 8000,
    });

    expect(result).toEqual({ servicesInserted: 1, rulesInserted: 1 });
    expect(create).toHaveBeenCalledWith(expect.anything(), {
      timeout: 8000,
      maxRetries: 0,
    });
    expect(readCalls.some((c) => c.method === "upsert")).toBe(false);
    expect(writeCalls).toContainEqual(
      expect.objectContaining({
        table: "maintenance_services",
        method: "upsert",
        args: [expect.any(Array), { onConflict: "code", ignoreDuplicates: true }],
      }),
    );
    expect(writeCalls).toContainEqual(
      expect.objectContaining({
        table: "maintenance_rules",
        method: "upsert",
        args: [
          [expect.objectContaining({ service_code: "TIRE_ROTATION", make: "Manac", engine_family: null })],
          {
            onConflict: "service_code,make,model,year_from,year_to,engine_family",
            ignoreDuplicates: true,
          },
        ],
      }),
    );
  });
});
