import "server-only";

import {
  createDeniedWorkspaceCapabilities,
  type EffectiveWorkspaceCapabilities,
  type WorkspaceCapabilityDecisionSource,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";

type CapabilityRpcRow = {
  profile_id: string;
  shop_id: string;
  canonical_role: string;
  capability_key: string;
  access_level: string;
  granted: boolean;
  decision_source: string;
};

type CapabilityRpcError = { message: string };

type CapabilityRpcClient = {
  rpc: (
    name: "workspace_current_actor_capabilities",
    args: { p_capability_keys: string[] },
  ) => PromiseLike<{
    data: CapabilityRpcRow[] | null;
    error: CapabilityRpcError | null;
  }>;
};

const DECISION_SOURCES = new Set<WorkspaceCapabilityDecisionSource>([
  "individual_override",
  "shop_role_policy",
  "profixiq_preset",
  "unavailable",
]);

export async function resolveCurrentWorkspaceCapabilities(input: {
  supabase: unknown;
  profileId: string;
  shopId: string;
  capabilityKeys: readonly WorkspaceCapabilityKey[];
}): Promise<{
  capabilities: EffectiveWorkspaceCapabilities;
  error: string | null;
}> {
  const capabilities = createDeniedWorkspaceCapabilities();
  const { data, error } = await (input.supabase as CapabilityRpcClient).rpc(
    "workspace_current_actor_capabilities",
    { p_capability_keys: [...input.capabilityKeys] },
  );

  if (error) {
    return { capabilities, error: error.message };
  }

  for (const row of data ?? []) {
    if (row.profile_id !== input.profileId || row.shop_id !== input.shopId) {
      return {
        capabilities: createDeniedWorkspaceCapabilities(),
        error: "Workspace authorization scope mismatch",
      };
    }
    if (!input.capabilityKeys.includes(row.capability_key as WorkspaceCapabilityKey)) {
      continue;
    }

    if (
      !DECISION_SOURCES.has(
        row.decision_source as WorkspaceCapabilityDecisionSource,
      ) ||
      (row.access_level !== "view" && row.access_level !== "manage")
    ) {
      return {
        capabilities: createDeniedWorkspaceCapabilities(),
        error: "Workspace authorization returned an invalid decision",
      };
    }

    const capabilityKey = row.capability_key as WorkspaceCapabilityKey;
    const source = row.decision_source as WorkspaceCapabilityDecisionSource;
    capabilities[capabilityKey] = {
      capabilityKey,
      accessLevel: row.access_level,
      granted: Boolean(row.granted),
      source,
    };
  }

  return { capabilities, error: null };
}
