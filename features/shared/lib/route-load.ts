export type RouteLoadFailureKind =
  | "timeout"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "network"
  | "error";

export type RouteLoadContext = {
  route: string;
  operation: string;
  tenantId?: string | null;
  actorId?: string | null;
  role?: string | null;
};

export type RouteLoadOperationContext = {
  requestId: string;
  recordStatus: (status: number) => void;
  signal: AbortSignal;
};

type RouteLoadFailureOptions = {
  kind: RouteLoadFailureKind;
  message: string;
  requestId?: string;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
};

export class RouteLoadFailure extends Error {
  readonly kind: RouteLoadFailureKind;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(options: RouteLoadFailureOptions) {
    super(options.message, { cause: options.cause });
    this.name = "RouteLoadFailure";
    this.kind = options.kind;
    this.requestId = options.requestId ?? null;
    this.retryable =
      options.retryable ??
      !["unauthenticated", "forbidden", "not-found"].includes(options.kind);
    this.status = options.status ?? null;
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function looksLikeNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const value = `${error.name} ${error.message}`.toLowerCase();
  return (
    value.includes("failed to fetch") ||
    value.includes("network") ||
    value.includes("load failed") ||
    value.includes("connection")
  );
}

export function asRouteLoadFailure(
  error: unknown,
  fallbackMessage = "This screen could not be loaded.",
): RouteLoadFailure {
  if (error instanceof RouteLoadFailure) return error;
  return new RouteLoadFailure({
    kind: looksLikeNetworkFailure(error) ? "network" : "error",
    message: fallbackMessage,
    cause: error,
  });
}

export function routeLoadFailureFromStatus(
  status: number,
  message: string,
  requestId?: string,
): RouteLoadFailure {
  if (status === 401) {
    return new RouteLoadFailure({
      kind: "unauthenticated",
      message,
      requestId,
      status,
      retryable: false,
    });
  }
  if (status === 403) {
    return new RouteLoadFailure({
      kind: "forbidden",
      message,
      requestId,
      status,
      retryable: false,
    });
  }
  if (status === 404) {
    return new RouteLoadFailure({
      kind: "not-found",
      message,
      requestId,
      status,
      retryable: false,
    });
  }
  return new RouteLoadFailure({
    kind: status >= 500 ? "network" : "error",
    message,
    requestId,
    status,
  });
}

export async function runBoundedRouteLoad<T>(
  context: RouteLoadContext,
  operation: (operationContext: RouteLoadOperationContext) => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const requestId = createRequestId();
  const controller = new AbortController();
  const startedAt = Date.now();
  let responseStatus: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => {
        controller.abort();
        reject(
          new RouteLoadFailure({
            kind: "timeout",
            message: "This screen took too long to load. Try again.",
            requestId,
          }),
        );
      },
      Math.max(1, timeoutMs),
    );
  });

  try {
    const result = await Promise.race([
      operation({
        requestId,
        recordStatus: (status) => {
          if (Number.isInteger(status) && status >= 100 && status <= 599) {
            responseStatus = status;
          }
        },
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
    console.info("[route-load] complete", {
      ...context,
      requestId,
      durationMs: Date.now() - startedAt,
      status: responseStatus ?? "success",
    });
    return result;
  } catch (error) {
    const failure = asRouteLoadFailure(error);
    const normalized = failure.requestId
      ? failure
      : new RouteLoadFailure({
          kind: failure.kind,
          message: failure.message,
          requestId,
          retryable: failure.retryable,
          status: failure.status ?? undefined,
          cause: failure.cause,
        });
    console.error("[route-load] failed", {
      ...context,
      requestId,
      durationMs: Date.now() - startedAt,
      failureKind: normalized.kind,
      retryable: normalized.retryable,
      status: normalized.status ?? responseStatus,
      cause:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });
    throw normalized;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
