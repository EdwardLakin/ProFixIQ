export type GeotabCredentialsInput = {
  database: string;
  username: string;
  password: string;
  server?: string;
};

type GeotabSessionCredentials = {
  database: string;
  userName: string;
  sessionId: string;
};

export type GeotabSession = {
  credentials: GeotabSessionCredentials;
  server: string;
};

type GeotabRpcError = {
  name?: string;
  message?: string;
};

type GeotabRpcResponse<T> = {
  result?: T;
  error?: GeotabRpcError;
};

export class GeotabApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GeotabApiError";
    this.code = code;
  }
}

const DEFAULT_SERVER = "my.geotab.com";

function normalizeServer(server: string | undefined): string {
  return (server?.trim() || DEFAULT_SERVER).replace(/^https?:\/\//, "");
}

async function rpcCall<T>(
  server: string,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://${server}/apiv1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });

  const body = (await response.json()) as GeotabRpcResponse<T>;

  if (body.error) {
    throw new GeotabApiError(
      body.error.name ?? "GeotabApiError",
      body.error.message ?? "Unknown Geotab API error",
    );
  }

  if (!response.ok) {
    throw new GeotabApiError("HttpError", `Geotab API returned HTTP ${response.status}`);
  }

  return body.result as T;
}

export async function authenticateGeotab(
  input: GeotabCredentialsInput,
): Promise<GeotabSession> {
  const baseServer = normalizeServer(input.server);

  const result = await rpcCall<{
    credentials: GeotabSessionCredentials;
    path: string;
  }>(baseServer, "Authenticate", {
    database: input.database,
    userName: input.username,
    password: input.password,
  });

  const server =
    result.path && result.path.toLowerCase() !== "thisserver"
      ? result.path
      : baseServer;

  return { credentials: result.credentials, server };
}

export async function geotabCall<T>(
  session: GeotabSession,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return rpcCall<T>(session.server, method, {
    ...params,
    credentials: session.credentials,
  });
}
