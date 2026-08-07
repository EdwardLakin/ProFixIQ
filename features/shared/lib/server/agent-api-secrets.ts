import { timingSafeEqual } from "node:crypto";

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

function secretMatches(expectedValue: unknown, providedValue: unknown): boolean {
  const expected = String(expectedValue ?? "").trim();
  const provided = String(providedValue ?? "").trim();
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer);
}

function bearerToken(request: Pick<Request, "headers">): string {
  const authorization = String(request.headers.get("authorization") ?? "").trim();
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

export function isAgentApiRequestAuthorized(
  request: Pick<Request, "headers">,
  environment: AgentApiSecretEnvironment = process.env,
): boolean {
  const configured = resolveAgentApiSecrets(environment);
  const expectedSecrets = [...new Set([
    configured.canonical,
    configured.profixiqAlias,
    configured.internalAlias,
  ].filter(Boolean))];
  const providedSecrets = [...new Set([
    request.headers.get("x-agent-api-secret"),
    request.headers.get("x-agent-secret"),
    bearerToken(request),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean))];

  return providedSecrets.some((provided) =>
    expectedSecrets.some((expected) => secretMatches(expected, provided))
  );
}
