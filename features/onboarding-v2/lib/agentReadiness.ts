export type ReadinessRolloutStage = "dry_run" | "http_verify_only" | "live_enabled" | null;

export type AgentReadiness = {
  ok: boolean;
  rolloutStage: ReadinessRolloutStage;
  connector: {
    mode: string;
    configured: boolean;
    liveMaterializationEnabled: boolean;
    canValidateShop: boolean;
    canWriteLive: boolean;
  };
  warnings: string[];
  requiredEnv?: string[];
};

export function isVerifyOnlyConfigured(readiness: AgentReadiness): boolean {
  return (
    readiness.ok &&
    readiness.rolloutStage === "http_verify_only" &&
    readiness.connector.configured &&
    !readiness.connector.liveMaterializationEnabled &&
    readiness.connector.canValidateShop
  );
}

export function defaultAgentReadiness(): AgentReadiness {
  return {
    ok: false,
    rolloutStage: null,
    connector: {
      mode: "unknown",
      configured: false,
      liveMaterializationEnabled: false,
      canValidateShop: false,
      canWriteLive: false,
    },
    warnings: ["Readiness unavailable. Verify-only safe mode remains enforced."],
  };
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function normalizeAgentReadiness(input: unknown): AgentReadiness {
  const source = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const connectorInput = (typeof source.connector === "object" && source.connector !== null ? source.connector : {}) as Record<string, unknown>;
  const stage = source.rolloutStage;
  const rolloutStage: ReadinessRolloutStage = stage === "dry_run" || stage === "http_verify_only" || stage === "live_enabled" ? stage : null;

  return {
    ok: asBoolean(source.ok),
    rolloutStage,
    connector: {
      mode: typeof connectorInput.mode === "string" ? connectorInput.mode : "unknown",
      configured: asBoolean(connectorInput.configured),
      liveMaterializationEnabled: asBoolean(connectorInput.liveMaterializationEnabled),
      canValidateShop: asBoolean(connectorInput.canValidateShop),
      canWriteLive: asBoolean(connectorInput.canWriteLive),
    },
    warnings: asStringArray(source.warnings),
    requiredEnv: asStringArray(source.requiredEnv),
  };
}
