export type ActivationReadiness = "READY" | "REVIEW_REQUIRED" | "BLOCKED";

export type ActivationContext = {
  demoId: string;
  intakeId: string;
  confidence: number;
  readiness: ActivationReadiness;
  blockers: string[];
  domains: string[];
};

const ACTIVATION_CONTEXT_STORAGE_KEY = "shop-boost-activation-context-v1";

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeAtob(input: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.atob(input);
  } catch {
    return null;
  }
}

function safeBtoa(input: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.btoa(input);
  } catch {
    return null;
  }
}

export function serializeActivationContext(context: ActivationContext): string {
  const encoded = safeBtoa(JSON.stringify(context));
  return encoded ?? JSON.stringify(context);
}

export function parseActivationContext(raw: string | null | undefined): ActivationContext | null {
  if (!raw) return null;

  const decode = (value: string) => {
    const base64Decoded = safeAtob(value);
    return base64Decoded ?? value;
  };

  try {
    const parsed = asRecord(JSON.parse(decode(raw)));
    const demoId = typeof parsed.demoId === "string" ? parsed.demoId : "";
    const intakeId = typeof parsed.intakeId === "string" ? parsed.intakeId : "";
    const readiness = parsed.readiness;

    if (!demoId || !intakeId) return null;
    if (readiness !== "READY" && readiness !== "REVIEW_REQUIRED" && readiness !== "BLOCKED") {
      return null;
    }

    return {
      demoId,
      intakeId,
      confidence: clampConfidence(parsed.confidence),
      readiness,
      blockers: parseStringArray(parsed.blockers),
      domains: parseStringArray(parsed.domains),
    };
  } catch {
    return null;
  }
}

export function parseActivationContextFromSearchParams(
  searchParams: URLSearchParams | ReadonlyURLSearchParams,
): ActivationContext | null {
  const contextFromQuery = searchParams.get("activationContext");
  return parseActivationContext(contextFromQuery);
}

export function persistActivationContext(context: ActivationContext): void {
  if (typeof window === "undefined") return;

  const serialized = serializeActivationContext(context);
  window.localStorage.setItem(ACTIVATION_CONTEXT_STORAGE_KEY, serialized);

  const url = new URL(window.location.href);
  url.searchParams.set("demoId", context.demoId);
  url.searchParams.set("intakeId", context.intakeId);
  url.searchParams.set("activationContext", serialized);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function readPersistedActivationContext(
  searchParams?: URLSearchParams | ReadonlyURLSearchParams,
): ActivationContext | null {
  const fromSearch = searchParams ? parseActivationContextFromSearchParams(searchParams) : null;
  if (fromSearch) return fromSearch;

  if (typeof window === "undefined") return null;
  return parseActivationContext(window.localStorage.getItem(ACTIVATION_CONTEXT_STORAGE_KEY));
}

export function toActivationQueryParams(context: ActivationContext): URLSearchParams {
  return new URLSearchParams({
    demoId: context.demoId,
    intakeId: context.intakeId,
    activationContext: serializeActivationContext(context),
  });
}

export function appendActivationContextToHref(href: string, context: ActivationContext): string {
  const [path, existingQuery = ""] = href.split("?");
  const params = new URLSearchParams(existingQuery);
  const activationParams = toActivationQueryParams(context);
  for (const [key, value] of activationParams.entries()) {
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

type ReadonlyURLSearchParams = Pick<URLSearchParams, "get">;
