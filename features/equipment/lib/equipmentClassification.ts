/**
 * Whether the signed-in user's shop is an Equipment shop, as the client needs it
 * to decide how to treat a Finish. The only source is the authoritative
 * entitlement endpoint (`/api/equipment/entitlement`); the last good answer is
 * remembered per shop and user so the answer survives going offline.
 *
 * "unknown" is a real answer: it is never treated as Equipment or as standard.
 * Callers must not show a completion on the strength of it.
 */
export type EquipmentClassification = "equipment" | "standard" | "unknown";

type Scope = { userId: string; shopId: string };

const FRESH_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 4_000;
const STORAGE_PREFIX = "equipment-classification:v1:";

const memory = new Map<string, { value: Exclude<EquipmentClassification, "unknown">; at: number }>();

function keyOf(scope: Scope | null | undefined): string | null {
  if (!scope?.userId || !scope?.shopId) return null;
  return `${scope.shopId}:${scope.userId}`;
}

function readStored(key: string): Exclude<EquipmentClassification, "unknown"> | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + key);
    return raw === "equipment" || raw === "standard" ? raw : null;
  } catch {
    return null;
  }
}

function remember(key: string | null, value: Exclude<EquipmentClassification, "unknown">) {
  if (!key) return;
  memory.set(key, { value, at: Date.now() });
  try {
    globalThis.localStorage?.setItem(STORAGE_PREFIX + key, value);
  } catch {
    // Storage can be blocked or full; the in-memory answer still works.
  }
}

/** Last known answer without any network call. Stale answers are still answers. */
export function getKnownEquipmentClassification(scope: Scope | null | undefined): EquipmentClassification {
  const key = keyOf(scope);
  if (!key) return "unknown";
  return memory.get(key)?.value ?? readStored(key) ?? "unknown";
}

async function fetchEnabled(): Promise<boolean | null> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const response = await fetch("/api/equipment/entitlement", {
      credentials: "include",
      cache: "no-store",
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { enabled?: unknown } | null;
    return typeof body?.enabled === "boolean" ? body.enabled : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Resolves the classification. A fresh answer is reused for a few minutes;
 * otherwise the endpoint is asked, and if it cannot be reached the last known
 * answer is used. With neither, the result is "unknown".
 */
export async function getEquipmentClassification(scope: Scope | null | undefined): Promise<EquipmentClassification> {
  const key = keyOf(scope);
  const cached = key ? memory.get(key) : undefined;
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.value;

  // Offline: do not even try the network; use what we last learned.
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const enabled = offline ? null : await fetchEnabled();
  if (enabled !== null) {
    const value = enabled ? "equipment" : "standard";
    remember(key, value);
    return value;
  }
  return getKnownEquipmentClassification(scope);
}

const VIEWER_PREFIX = "equipment-viewer:v1:";

/**
 * The signed-in technician's profile id, remembered per shop and user so the
 * per-technician Start/Finish decision still works offline. The profile id is
 * what labor segments are keyed by; it can differ from the auth user id.
 */
export function rememberViewerProfileId(scope: Scope | null | undefined, profileId: string) {
  const key = keyOf(scope);
  if (!key || !profileId) return;
  try {
    globalThis.localStorage?.setItem(VIEWER_PREFIX + key, profileId);
  } catch {
    // ignore
  }
}

export function getRememberedViewerProfileId(scope: Scope | null | undefined): string | null {
  const key = keyOf(scope);
  if (!key) return null;
  try {
    return globalThis.localStorage?.getItem(VIEWER_PREFIX + key) || null;
  } catch {
    return null;
  }
}

/** Test hook: forget every remembered answer. */
export function resetEquipmentClassificationForTests() {
  memory.clear();
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const name = storage.key(i);
      if (name?.startsWith(STORAGE_PREFIX) || name?.startsWith(VIEWER_PREFIX)) storage.removeItem(name);
    }
  } catch {
    // ignore
  }
}
