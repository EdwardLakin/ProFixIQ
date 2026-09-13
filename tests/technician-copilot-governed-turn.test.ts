import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendCopilotServerCommand: vi.fn(),
  runTechnicianCopilotTurn: vi.fn(),
  claimDurableAIRouteQuota: vi.fn(),
  completeDurableAIRouteQuota: vi.fn(),
  registerAIUsageEvent: vi.fn(),
  estimateCopilotTurnCostUsd: vi.fn(() => 0.02),
  createAdminSupabase: vi.fn(() => ({})),
}));

vi.mock("@/features/copilot/technician/server/transport", () => ({
  sendCopilotServerCommand: mocks.sendCopilotServerCommand,
}));
vi.mock("@/features/copilot/technician/server/chat", () => ({
  runTechnicianCopilotTurn: mocks.runTechnicianCopilotTurn,
}));
const { FakeQuotaUnavailable } = vi.hoisted(() => ({
  FakeQuotaUnavailable: class extends Error {
    constructor(
      readonly code: string,
      readonly deterministic: boolean,
    ) {
      super(`AI route quota unavailable (${code})`);
      this.name = "DurableAIQuotaUnavailableError";
    }
  },
}));

vi.mock("@/features/shared/lib/server/durable-ai-guard", () => ({
  claimDurableAIRouteQuota: mocks.claimDurableAIRouteQuota,
  completeDurableAIRouteQuota: mocks.completeDurableAIRouteQuota,
  DurableAIQuotaUnavailableError: FakeQuotaUnavailable,
}));
vi.mock("@/features/shared/lib/server/ai-ops-guard", () => ({
  registerAIUsageEvent: mocks.registerAIUsageEvent,
  estimateCopilotTurnCostUsd: mocks.estimateCopilotTurnCostUsd,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));
vi.mock("@/features/shared/lib/server/ai-telemetry-context", () => ({
  withAITelemetryContext: (
    _context: unknown,
    run: () => unknown | Promise<unknown>,
  ) => run(),
}));

import {
  runGovernedTechnicianCopilotTurn,
  TechnicianCopilotQuotaError,
} from "@/features/copilot/technician/server/governedTurn";

const TURN_ID = "turn-1";

function turn(documentationEnabled = true) {
  return {
    sessionId: "session-1",
    turnId: TURN_ID,
    identity: {
      authUserId: "auth-1",
      profileId: "profile-1",
      shopId: "shop-1",
      documentationEnabled,
    },
  } as unknown as Parameters<
    typeof runGovernedTechnicianCopilotTurn
  >[0]["turn"];
}

function freshEnvelope() {
  return {
    session: { status: "active" },
    events: [],
    documentationTurns: [],
  };
}

function closedEnvelope() {
  return {
    session: { status: "closed" },
    events: [],
    documentationTurns: [],
  };
}

function run() {
  return runGovernedTechnicianCopilotTurn({
    endpoint: "/api/copilot/technician/chat",
    turn: turn(),
  });
}

describe("governed technician CoPilot turn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.estimateCopilotTurnCostUsd.mockReturnValue(0.02);
    mocks.createAdminSupabase.mockReturnValue({});
    mocks.runTechnicianCopilotTurn.mockResolvedValue({
      ok: true,
      modelCalls: 2,
    });
    mocks.claimDurableAIRouteQuota.mockResolvedValue({
      allowed: true,
      receiptId: "receipt-1",
    });
    mocks.completeDurableAIRouteQuota.mockResolvedValue(undefined);
  });

  it("does not reserve quota when persisted replay state says no provider call will run", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(closedEnvelope());

    await run();

    expect(mocks.claimDurableAIRouteQuota).not.toHaveBeenCalled();
    expect(mocks.completeDurableAIRouteQuota).not.toHaveBeenCalled();
    expect(mocks.runTechnicianCopilotTurn).toHaveBeenCalledTimes(1);
  });

  it("reads replay state before reserving quota on a fresh turn", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());

    await run();

    expect(mocks.sendCopilotServerCommand).toHaveBeenCalledTimes(1);
    expect(mocks.claimDurableAIRouteQuota).toHaveBeenCalledTimes(1);
    expect(
      mocks.sendCopilotServerCommand.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.claimDurableAIRouteQuota.mock.invocationCallOrder[0]);
  });

  it("settles the receipt as succeeded after a completed turn", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());

    await run();

    expect(mocks.completeDurableAIRouteQuota).toHaveBeenCalledTimes(1);
    expect(mocks.completeDurableAIRouteQuota.mock.calls[0][0]).toMatchObject({
      receiptId: "receipt-1",
      succeeded: true,
      actualCostUsd: 0.02,
    });
  });

  it("settles the receipt at the reserved proxy cost when the turn throws", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.runTechnicianCopilotTurn.mockRejectedValue(new Error("provider"));

    await expect(run()).rejects.toThrow("provider");

    expect(mocks.completeDurableAIRouteQuota).toHaveBeenCalledTimes(1);
    expect(mocks.completeDurableAIRouteQuota.mock.calls[0][0]).toMatchObject({
      receiptId: "receipt-1",
      succeeded: false,
      actualCostUsd: 0.02,
    });
  });

  it("denies the turn without calling the provider when quota is exhausted", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.claimDurableAIRouteQuota.mockResolvedValue({
      allowed: false,
      reason: "hard_budget_exceeded",
      retryAfterSeconds: 900,
    });

    const error = await run().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(TechnicianCopilotQuotaError);
    expect((error as TechnicianCopilotQuotaError).status).toBe(402);
    expect((error as Error).message).toContain("AI fair-use limit");
    expect(mocks.runTechnicianCopilotTurn).not.toHaveBeenCalled();
  });

  it("fails closed and preserves retryability when spend governance is unavailable", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.claimDurableAIRouteQuota.mockRejectedValue(new Error("rpc down"));

    const error = await run().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TechnicianCopilotQuotaError);
    expect((error as TechnicianCopilotQuotaError).code).toBe(
      "governance_unavailable",
    );
    expect((error as TechnicianCopilotQuotaError).status).toBe(429);
    expect(mocks.runTechnicianCopilotTurn).not.toHaveBeenCalled();
    expect(mocks.completeDurableAIRouteQuota).not.toHaveBeenCalled();
  });

  it("continues to the durable claim when replay preflight itself is unavailable", async () => {
    mocks.sendCopilotServerCommand.mockRejectedValue(new Error("transport"));

    await run();

    expect(mocks.claimDurableAIRouteQuota).toHaveBeenCalledTimes(1);
    expect(mocks.runTechnicianCopilotTurn).toHaveBeenCalledTimes(1);
  });

  it("settles a reserved turn at zero when it reached no provider", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.runTechnicianCopilotTurn.mockResolvedValue({
      ok: true,
      modelCalls: 0,
    });

    await run();

    expect(mocks.completeDurableAIRouteQuota).toHaveBeenCalledTimes(1);
    expect(mocks.completeDurableAIRouteQuota.mock.calls[0][0]).toMatchObject({
      receiptId: "receipt-1",
      succeeded: true,
      actualCostUsd: 0,
    });
    expect(mocks.registerAIUsageEvent.mock.calls[0][0]).toMatchObject({
      estimatedCostUsd: 0,
    });
  });

  it("refuses the turn when the quota RPC rejects the claim deterministically", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.claimDurableAIRouteQuota.mockRejectedValue(
      new FakeQuotaUnavailable("22023", true),
    );

    const error = await run().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TechnicianCopilotQuotaError);
    expect((error as TechnicianCopilotQuotaError).code).toBe(
      "governance_unavailable",
    );
    expect((error as TechnicianCopilotQuotaError).status).toBe(429);
    expect(mocks.runTechnicianCopilotTurn).not.toHaveBeenCalled();
  });

  it("also fails closed when the quota RPC fault is transient", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.claimDurableAIRouteQuota.mockRejectedValue(
      new FakeQuotaUnavailable("57014", false),
    );

    const error = await run().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TechnicianCopilotQuotaError);
    expect((error as TechnicianCopilotQuotaError).code).toBe(
      "governance_unavailable",
    );
    expect((error as TechnicianCopilotQuotaError).status).toBe(429);
    expect(mocks.runTechnicianCopilotTurn).not.toHaveBeenCalled();
    expect(mocks.completeDurableAIRouteQuota).not.toHaveBeenCalled();
  });

  it("still bills a replayed turn that re-ran the documentation extractor", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.runTechnicianCopilotTurn.mockResolvedValue({
      ok: true,
      replayed: true,
      modelCalls: 1,
    });

    await run();

    expect(mocks.completeDurableAIRouteQuota.mock.calls[0][0]).toMatchObject({
      actualCostUsd: 0.02,
    });
  });
});
