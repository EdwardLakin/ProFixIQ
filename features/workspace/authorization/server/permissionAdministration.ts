import "server-only";

import {
  isWorkspaceCapabilityEffect,
  isWorkspaceCapabilityKey,
  type WorkspaceCapabilityDecisionSource,
  type WorkspaceCapabilityEffect,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";

export type PermissionAdministrationCapability = {
  capabilityKey: WorkspaceCapabilityKey;
  isProtected: boolean;
  actorCanGrant: boolean;
};

export type PermissionAdministrationPolicy = {
  roleKey: string;
  capabilityKey: WorkspaceCapabilityKey;
  effect: Exclude<WorkspaceCapabilityEffect, "inherit">;
};

export type PermissionAdministrationEmployee = {
  profileId: string;
  fullName: string | null;
  canonicalRole: string;
  isSelf: boolean;
  manageable: boolean;
  overrides: Array<{
    capabilityKey: WorkspaceCapabilityKey;
    effect: Exclude<WorkspaceCapabilityEffect, "inherit">;
  }>;
  effective: Array<{
    capabilityKey: WorkspaceCapabilityKey;
    granted: boolean;
    source: WorkspaceCapabilityDecisionSource;
  }>;
};

export type PermissionAdministrationSnapshot = {
  shopId: string;
  actor: { profileId: string; canonicalRole: string; isOwner: boolean };
  manageableRoles: string[];
  capabilities: PermissionAdministrationCapability[];
  presets: PermissionAdministrationPolicy[];
  rolePolicies: PermissionAdministrationPolicy[];
  employee: PermissionAdministrationEmployee | null;
};

type SnapshotRpcClient = {
  rpc: (
    name: "workspace_permission_administration_snapshot",
    args: { p_target_profile_id: string | null },
  ) => PromiseLike<{
    data: unknown;
    error: { message: string; code?: string | null } | null;
  }>;
};

const DECISION_SOURCES = new Set<WorkspaceCapabilityDecisionSource>([
  "individual_override",
  "shop_role_policy",
  "profixiq_preset",
  "unavailable",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function effect(value: unknown): "allow" | "deny" | null {
  return isWorkspaceCapabilityEffect(value) && value !== "inherit" ? value : null;
}

function policies(value: unknown): PermissionAdministrationPolicy[] {
  const parsed: PermissionAdministrationPolicy[] = [];
  for (const entry of list(value)) {
    const row = record(entry);
    if (!row) continue;
    const capabilityKey = row.capability_key;
    const roleKey = text(row.role_key);
    const rowEffect = effect(row.effect);
    // Unknown capability keys are rows the application does not model yet.
    // They are ignored for presentation and never invented as "allowed".
    if (!isWorkspaceCapabilityKey(capabilityKey) || !roleKey || !rowEffect) {
      continue;
    }
    parsed.push({ roleKey, capabilityKey, effect: rowEffect });
  }
  return parsed;
}

function employee(value: unknown): PermissionAdministrationEmployee | null {
  const row = record(value);
  if (!row) return null;
  const profileId = text(row.profile_id);
  if (!profileId) return null;

  const overrides: PermissionAdministrationEmployee["overrides"] = [];
  for (const entry of list(row.overrides)) {
    const override = record(entry);
    if (!override) continue;
    const capabilityKey = override.capability_key;
    const overrideEffect = effect(override.effect);
    if (!isWorkspaceCapabilityKey(capabilityKey) || !overrideEffect) continue;
    overrides.push({ capabilityKey, effect: overrideEffect });
  }

  const effective: PermissionAdministrationEmployee["effective"] = [];
  for (const entry of list(row.effective)) {
    const decision = record(entry);
    if (!decision) continue;
    const capabilityKey = decision.capability_key;
    if (!isWorkspaceCapabilityKey(capabilityKey)) continue;
    const source = text(decision.decision_source) as WorkspaceCapabilityDecisionSource;
    effective.push({
      capabilityKey,
      granted: decision.granted === true,
      source: DECISION_SOURCES.has(source) ? source : "unavailable",
    });
  }

  return {
    profileId,
    fullName: typeof row.full_name === "string" ? row.full_name : null,
    canonicalRole: text(row.canonical_role),
    isSelf: row.is_self === true,
    manageable: row.manageable === true,
    overrides,
    effective,
  };
}

/**
 * Load the shop-scoped permission administration read model.
 *
 * The database RPC is the authority: it re-checks team.permissions.manage,
 * binds every row to the caller's own shop, and never returns another tenant.
 * This function only narrows the payload and fails closed on anything it does
 * not recognize.
 */
export async function loadPermissionAdministrationSnapshot(input: {
  supabase: unknown;
  shopId: string;
  targetProfileId?: string | null;
}): Promise<
  | { ok: true; snapshot: PermissionAdministrationSnapshot }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await (input.supabase as SnapshotRpcClient).rpc(
    "workspace_permission_administration_snapshot",
    { p_target_profile_id: input.targetProfileId ?? null },
  );

  if (error) {
    return {
      ok: false,
      status: error.code === "42501" ? 403 : 503,
      error:
        error.code === "42501"
          ? "Forbidden"
          : "Authorization service unavailable",
    };
  }

  const row = record(data);
  const actor = record(row?.actor);
  const shopId = text(row?.shop_id);
  if (!row || !actor || !shopId || shopId !== input.shopId) {
    return {
      ok: false,
      status: 503,
      error: "Authorization service unavailable",
    };
  }

  const capabilities: PermissionAdministrationCapability[] = [];
  for (const entry of list(row.capabilities)) {
    const capability = record(entry);
    if (!capability) continue;
    const capabilityKey = capability.capability_key;
    if (!isWorkspaceCapabilityKey(capabilityKey)) continue;
    capabilities.push({
      capabilityKey,
      isProtected: capability.is_protected === true,
      actorCanGrant: capability.actor_can_grant === true,
    });
  }

  return {
    ok: true,
    snapshot: {
      shopId,
      actor: {
        profileId: text(actor.profile_id),
        canonicalRole: text(actor.canonical_role),
        isOwner: actor.is_owner === true,
      },
      manageableRoles: list(row.manageable_roles)
        .map((value) => text(value))
        .filter((value) => value.length > 0),
      capabilities,
      presets: policies(row.presets),
      rolePolicies: policies(row.role_policies),
      employee: employee(row.employee),
    },
  };
}
