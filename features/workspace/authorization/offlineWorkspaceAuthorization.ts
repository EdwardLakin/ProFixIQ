import {
  createDeniedWorkspaceCapabilities,
  type EffectiveWorkspaceCapabilities,
  type WorkspaceCapabilityDecisionSource,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";

const SNAPSHOT_KEY = "profixiq_workspace_authorization_v1";

export type WorkspaceAuthorizationActor = {
  userId: string;
  profileId: string;
  shopId: string;
  role: string | null;
};

export type WorkspaceAuthorizationSnapshot = {
  version: 1;
  actor: WorkspaceAuthorizationActor;
  capabilities: EffectiveWorkspaceCapabilities;
  verifiedAt: string;
};

function browserReady(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function decisionSource(value: unknown): WorkspaceCapabilityDecisionSource {
  return value === "individual_override" ||
    value === "shop_role_policy" ||
    value === "profixiq_preset"
    ? value
    : "unavailable";
}

export function normalizeWorkspaceCapabilities(
  input: Partial<
    Record<WorkspaceCapabilityKey, { granted?: boolean; source?: string }>
  >,
): EffectiveWorkspaceCapabilities {
  const next = createDeniedWorkspaceCapabilities();
  for (const capabilityKey of Object.keys(next) as WorkspaceCapabilityKey[]) {
    const decision = input[capabilityKey];
    if (!decision) continue;
    const source = decisionSource(decision.source);
    next[capabilityKey] = {
      ...next[capabilityKey],
      granted: source !== "unavailable" && Boolean(decision.granted),
      source,
    };
  }
  return next;
}

export function persistWorkspaceAuthorizationSnapshot(input: {
  actor: WorkspaceAuthorizationActor;
  capabilities: EffectiveWorkspaceCapabilities;
}): void {
  if (!browserReady()) return;
  const actor = {
    userId: clean(input.actor.userId),
    profileId: clean(input.actor.profileId),
    shopId: clean(input.actor.shopId),
    role: clean(input.actor.role) || null,
  };
  if (!actor.userId || !actor.profileId || !actor.shopId) return;

  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        version: 1,
        actor,
        capabilities: input.capabilities,
        verifiedAt: new Date().toISOString(),
      } satisfies WorkspaceAuthorizationSnapshot),
    );
  } catch {
    // Online authorization remains authoritative when device storage is full.
  }
}

export function readWorkspaceAuthorizationSnapshot(input: {
  userId: string;
  shopId?: string | null;
}): WorkspaceAuthorizationSnapshot | null {
  if (!browserReady()) return null;
  try {
    const raw = JSON.parse(
      localStorage.getItem(SNAPSHOT_KEY) ?? "null",
    ) as Partial<WorkspaceAuthorizationSnapshot> | null;
    const actor = raw?.actor;
    if (
      raw?.version !== 1 ||
      !actor ||
      clean(actor.userId) !== clean(input.userId) ||
      (clean(input.shopId) && clean(actor.shopId) !== clean(input.shopId)) ||
      !clean(actor.profileId) ||
      !clean(actor.shopId) ||
      !raw.capabilities
    ) {
      return null;
    }

    return {
      version: 1,
      actor: {
        userId: clean(actor.userId),
        profileId: clean(actor.profileId),
        shopId: clean(actor.shopId),
        role: clean(actor.role) || null,
      },
      capabilities: normalizeWorkspaceCapabilities(raw.capabilities),
      verifiedAt: clean(raw.verifiedAt),
    };
  } catch {
    return null;
  }
}

export function clearWorkspaceAuthorizationSnapshot(): void {
  if (!browserReady()) return;
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Best-effort cleanup; session matching still prevents cross-user reuse.
  }
}
