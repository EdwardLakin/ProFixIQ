export type AgentApiSecretEnvironment = Record<string, string | undefined>;

export type AgentApiSecrets = {
  canonical: string;
  profixiqAlias: string;
  internalAlias: string;
  primary: string;
};

export function resolveAgentApiSecrets(
  environment: AgentApiSecretEnvironment = process.env,
): AgentApiSecrets {
  const canonical = String(environment.AGENT_API_SECRET ?? "").trim();
  const profixiqAlias = String(
    environment.PROFIXIQ_AGENT_API_SECRET ?? "",
  ).trim();
  const internalAlias = String(environment.INTERNAL_AGENT_SECRET ?? "").trim();

  return {
    canonical,
    profixiqAlias,
    internalAlias,
    primary: canonical || profixiqAlias || internalAlias,
  };
}
