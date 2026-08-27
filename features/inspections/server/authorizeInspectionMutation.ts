import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  canonicalizeRole,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { resolveCurrentWorkspaceCapabilities } from "@/features/workspace/authorization/server/resolveWorkspaceCapabilities";

type InspectionMutationActor = {
  authUserId: string;
  profileId: string;
  shopId: string;
  canonicalRole: CanonicalRole;
};

export type InspectionSignatureRole = "technician" | "customer" | "advisor";

export type InspectionCommittedSignatureReplay = {
  inspectionId: string;
  role: InspectionSignatureRole;
  expectedSyncRevision: number;
  signedName: string;
};

export type InspectionMutationReplay =
  | { kind: "none" }
  | {
      kind: "signature";
      inspectionId: string;
      role: InspectionSignatureRole;
      signingCycle: number;
      syncRevision: number;
    };

export type InspectionMutationAuthorization =
  | {
      ok: true;
      actor: InspectionMutationActor;
      replay: InspectionMutationReplay;
    }
  | { ok: false; error: string; status: 401 | 403 | 500 };

type WorkOrderLineScope = {
  id: string;
  work_order_id: string | null;
  assigned_tech_id: string | null;
  assigned_to: string | null;
};

type InspectionReplayScope = {
  id: string;
  completed: boolean | null;
  finalized_at: string | null;
  is_draft: boolean | null;
  locked: boolean;
  signing_cycle: number;
  summary: unknown;
};

function summarySyncRevision(summary: unknown): number | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const value = (summary as Record<string, unknown>).syncRevision;
  const revision =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

/**
 * Authorize a canonical inspection mutation against the same Workspace
 * capability and line-assignment contract enforced by the database writer.
 * Service-role reads are used only after the Supabase session is verified and
 * remain pinned to the caller's canonical profile and requested tenant.
 */
export async function authorizeInspectionMutation(input: {
  sessionClient: SupabaseClient<Database>;
  shopId: string;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  committedSignatureReplay?: InspectionCommittedSignatureReplay;
}): Promise<InspectionMutationAuthorization> {
  const {
    data: { user },
    error: authError,
  } = await input.sessionClient.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  const { profile, error: profileError } =
    await resolveAuthenticatedStaffProfile(input.sessionClient, user.id);
  if (profileError) {
    return {
      ok: false,
      error: "Unable to verify inspection authorization.",
      status: 500,
    };
  }
  if (!profile?.shop_id || profile.shop_id !== input.shopId) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  const capability = await resolveCurrentWorkspaceCapabilities({
    supabase: input.sessionClient,
    profileId: profile.id,
    shopId: profile.shop_id,
    capabilityKeys: [WORKSPACE_CAPABILITIES.runWorkOrderInspections],
  });
  if (
    capability.error ||
    !capability.capabilities[WORKSPACE_CAPABILITIES.runWorkOrderInspections]
      .granted
  ) {
    return {
      ok: false,
      error: "Inspection capability is required.",
      status: 403,
    };
  }

  const admin = createAdminSupabase();
  let line: WorkOrderLineScope | null = null;
  if (input.workOrderLineId) {
    let lineQuery = admin
      .from("work_order_lines")
      .select("id,work_order_id,assigned_tech_id,assigned_to")
      .eq("id", input.workOrderLineId)
      .eq("shop_id", profile.shop_id);
    if (input.workOrderId) {
      lineQuery = lineQuery.eq("work_order_id", input.workOrderId);
    }
    const lineResult = await lineQuery.maybeSingle<WorkOrderLineScope>();
    if (lineResult.error) {
      return {
        ok: false,
        error: "Unable to verify inspection job assignment.",
        status: 500,
      };
    }
    line = lineResult.data;
    if (!line?.id || !line.work_order_id) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
  }

  const workOrderId = input.workOrderId ?? line?.work_order_id ?? null;
  if (workOrderId) {
    const workOrder = await admin
      .from("work_orders")
      .select("id")
      .eq("id", workOrderId)
      .eq("shop_id", profile.shop_id)
      .maybeSingle<{ id: string }>();
    if (workOrder.error) {
      return {
        ok: false,
        error: "Unable to verify inspection work order.",
        status: 500,
      };
    }
    if (!workOrder.data?.id) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
  }

  const canonicalRole = canonicalizeRole(profile.role);
  let replay: InspectionMutationReplay = { kind: "none" };
  // Legacy standalone inspections have no repair line to assign. Preserve that
  // capability-only contract while keeping Work Order inspections bound to the
  // exact line assignment.
  if (canonicalRole === "mechanic" && line) {
    const actorIds = [...new Set([profile.id, user.id])];
    let assigned = Boolean(
      line &&
      actorIds.some(
        (actorId) =>
          line.assigned_tech_id === actorId || line.assigned_to === actorId,
      ),
    );

    if (!assigned && line) {
      const supporting = await admin
        .from("work_order_line_technicians")
        .select("technician_id")
        .eq("work_order_line_id", line.id)
        .in("technician_id", actorIds)
        .limit(1);
      if (supporting.error) {
        return {
          ok: false,
          error: "Unable to verify inspection job assignment.",
          status: 500,
        };
      }
      assigned = Boolean(supporting.data?.length);
    }

    if (!assigned) {
      const retry = input.committedSignatureReplay;
      if (
        retry &&
        line &&
        workOrderId &&
        Number.isSafeInteger(retry.expectedSyncRevision) &&
        retry.expectedSyncRevision >= 1
      ) {
        const inspectionResult = await admin
          .from("inspections")
          .select(
            "id,completed,finalized_at,is_draft,locked,signing_cycle,summary",
          )
          .eq("id", retry.inspectionId)
          .eq("shop_id", profile.shop_id)
          .eq("work_order_id", workOrderId)
          .eq("work_order_line_id", line.id)
          .eq("is_canonical", true)
          .maybeSingle<InspectionReplayScope>();

        if (inspectionResult.error) {
          return {
            ok: false,
            error: "Unable to verify committed inspection signature.",
            status: 500,
          };
        }

        const inspection = inspectionResult.data;
        const syncRevision = summarySyncRevision(inspection?.summary);
        const terminal = Boolean(
          inspection &&
          (inspection.locked ||
            inspection.completed ||
            inspection.is_draft === false ||
            inspection.finalized_at),
        );

        if (
          inspection &&
          terminal &&
          syncRevision === retry.expectedSyncRevision
        ) {
          const signatureResult = await admin
            .from("inspection_signatures")
            .select("id,signed_name")
            .eq("inspection_id", inspection.id)
            .eq("role", retry.role)
            .eq("signing_cycle", inspection.signing_cycle)
            .eq("signed_sync_revision", syncRevision)
            .eq("signed_by", user.id)
            .limit(1)
            .maybeSingle<{ id: string; signed_name: string | null }>();

          if (signatureResult.error) {
            return {
              ok: false,
              error: "Unable to verify committed inspection signature.",
              status: 500,
            };
          }

          if (
            signatureResult.data?.id &&
            (retry.role !== "customer" ||
              signatureResult.data.signed_name === retry.signedName.trim())
          ) {
            replay = {
              kind: "signature",
              inspectionId: inspection.id,
              role: retry.role,
              signingCycle: inspection.signing_cycle,
              syncRevision,
            };
          }
        }
      }

      if (replay.kind === "none") {
        return {
          ok: false,
          error: "Inspection work is limited to the assigned technician.",
          status: 403,
        };
      }
    }
  }

  return {
    ok: true,
    actor: {
      authUserId: user.id,
      profileId: profile.id,
      shopId: profile.shop_id,
      canonicalRole,
    },
    replay,
  };
}
