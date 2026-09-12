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

/** A live session with no prior work recorded for this turn. */
function freshEnvelope() {
  return {
    session: { status: "active" },
    events: [],
    documentationTurns: [],
  };
}

/** A session already closed, which is one of the canonical replay exits. */
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

    // The point of the ordering: a retry of the same turnId must not burn a
    // rate/budget slot when the canonical service will exit before OpenAI.
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
    // Settling at $0 would let repeated malformed responses bypass the ceiling.
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

    await expect(run()).rejects.toBeInstanceOf(TechnicianCopilotQuotaError);
    expect(mocks.runTechnicianCopilotTurn).not.toHaveBeenCalled();
  });

  it("fails open and still serves the turn when the quota RPC is unavailable", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.claimDurableAIRouteQuota.mockRejectedValue(new Error("rpc down"));

    await expect(run()).resolves.toEqual({ ok: true, modelCalls: 2 });

    // Accounting must never take the CoPilot down, and with no receipt there
    // is nothing to settle.
    expect(mocks.runTechnicianCopilotTurn).toHaveBeenCalledTimes(1);
    expect(mocks.completeDurableAIRouteQuota).not.toHaveBeenCalled();
  });

  it("fails open when the replay preflight itself is unavailable", async () => {
    mocks.sendCopilotServerCommand.mockRejectedValue(new Error("transport"));

    await run();

    expect(mocks.claimDurableAIRouteQuota).toHaveBeenCalledTimes(1);
    expect(mocks.runTechnicianCopilotTurn).toHaveBeenCalledTimes(1);
  });

  it("settles a reserved turn at zero when it reached no provider", async () => {
    // The preflight and the claim are not atomic, so two requests sharing a
    // turnId can both reserve. The loser reaches the canonical service, finds
    // the winner's persisted turn and returns without calling OpenAI. Billing
    // the proxy there would let a retrying client inflate the shop's monthly
    // budget with no spend behind it.
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
    // The app deploying ahead of its migration rejects every claim as invalid
    // input. Failing open there disables the ceiling for the whole rollout
    // window, silently, which is precisely when it is load-bearing.
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.claimDurableAIRouteQuota.mockRejectedValue(
      new FakeQuotaUnavailable("22023", true),
    );

    const error = await run().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TechnicianCopilotQuotaError);
    expect((error as TechnicianCopilotQuotaError).code).toBe(
      "governance_unavailable",
    );
    // Retryable, so the client keeps the technician's pending intent rather
    // than discarding it as it does for terminal failures.
    expect((error as TechnicianCopilotQuotaError).status).toBe(429);
    expect(mocks.runTechnicianCopilotTurn).not.toHaveBeenCalled();
  });

  it("still fails open when the quota RPC fault is transient", async () => {
    mocks.sendCopilotServerCommand.mockResolvedValue(freshEnvelope());
    mocks.claimDurableAIRouteQuota.mockRejectedValue(
      new FakeQuotaUnavailable("57014", false),
    );

    // Accounting must not take the CoPilot down for a timeout or a dropped
    // connection; only a systematic rejection is worth refusing service over.
    await expect(run()).resolves.toEqual({ ok: true, modelCalls: 2 });
    expect(mocks.completeDurableAIRouteQuota).not.toHaveBeenCalled();
  });

  it("still bills a replayed turn that re-ran the documentation extractor", async () => {
    // `replayed` alone does not mean free: the documentation call is gated
    // only on the capability, so a turn can skip the decision model and still
    // spend. Settling those at zero would under-bill real provider calls.
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
