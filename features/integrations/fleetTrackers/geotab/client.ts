import {
  getGeotabDatabase,
  getGeotabPassword,
  getGeotabServer,
  getGeotabUsername,
} from "./env";

type GeotabCredentials = {
  database: string;
  userName: string;
  sessionId: string;
};

type GeotabRpcError = {
  name?: string;
  message?: string;
};

type GeotabRpcResponse<T> = {
  result?: T;
  error?: GeotabRpcError;
};

type GeotabSession = {
  credentials: GeotabCredentials;
  server: string;
};

let cachedSession: GeotabSession | null = null;

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
    throw new GeotabApiError(body.error.name ?? "GeotabApiError", body.error.message ?? "Unknown Geotab API error");
  }

  if (!response.ok) {
    throw new GeotabApiError("HttpError", `Geotab API returned HTTP ${response.status}`);
  }

  return body.result as T;
}

export class GeotabApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GeotabApiError";
    this.code = code;
  }
}

function isSessionInvalid(error: unknown): boolean {
  return (
    error instanceof GeotabApiError &&
    (error.code === "InvalidUserException" ||
      error.code === "DbUnavailableException" ||
      /session/i.test(error.message))
  );
}

async function authenticate(): Promise<GeotabSession> {
  const baseServer = getGeotabServer();
  const result = await rpcCall<{
    credentials: GeotabCredentials;
    path: string;
  }>(baseServer, "Authenticate", {
    database: getGeotabDatabase(),
    userName: getGeotabUsername(),
    password: getGeotabPassword(),
  });

  const server =
    result.path && result.path.toLowerCase() !== "thisserver"
      ? result.path
      : baseServer;

  const session: GeotabSession = { credentials: result.credentials, server };
  cachedSession = session;
  return session;
}

async function getSession(): Promise<GeotabSession> {
  if (cachedSession) return cachedSession;
  return authenticate();
}

export async function geotabCall<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const session = await getSession();

  try {
    return await rpcCall<T>(session.server, method, {
      ...params,
      credentials: session.credentials,
    });
  } catch (error) {
    if (!isSessionInvalid(error)) throw error;

    cachedSession = null;
    const freshSession = await authenticate();
    return rpcCall<T>(freshSession.server, method, {
      ...params,
      credentials: freshSession.credentials,
    });
  }
}
