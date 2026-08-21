import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  getActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import {
  createWorkOrderWorkspaceResource,
  type WorkOrderWorkspaceServerSnapshot,
} from "@/features/work-orders/workspace/workOrderWorkspace";

type WorkOrderRow = Database["public"]["Tables"]["work_orders"]["Row"];

type WorkspaceWorkOrderRow = Pick<
  WorkOrderRow,
  | "id"
  | "shop_id"
  | "customer_id"
  | "vehicle_id"
  | "custom_id"
  | "status"
  | "payment_status"
  | "approval_state"
  | "record_type"
>;

type WorkspaceWorkOrderColumn = "id" | "custom_id";

const WORK_ORDER_WORKSPACE_SELECT =
  "id,shop_id,customer_id,vehicle_id,custom_id,status,payment_status,approval_state,record_type";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WORK_ORDER_WORKSPACE_READER_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const satisfies readonly CanonicalRole[];

function normalizedCustomIdReference(value: string | null | undefined):
  | { prefix: string; numericValue: number }
  | null {
  const match = String(value ?? "")
    .trim()
    .toUpperCase()
    .match(/^([A-Z]+)\s*0*(\d+)$/);
  if (!match) return null;

  const numericValue = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(numericValue)) return null;
  return { prefix: match[1], numericValue };
}

function customIdReferencesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizedCustomIdReference(left);
  const normalizedRight = normalizedCustomIdReference(right);
  return (
    normalizedLeft !== null &&
    normalizedRight !== null &&
    normalizedLeft.prefix === normalizedRight.prefix &&
    normalizedLeft.numericValue === normalizedRight.numericValue
  );
}

function throwQueryError(
  error: { message: string } | null,
  context: string,
): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function loadExactWorkOrder(
  supabase: SupabaseClient<Database>,
  shopId: string,
  column: WorkspaceWorkOrderColumn,
  value: string,
): Promise<WorkspaceWorkOrderRow | null> {
  const result = await supabase
    .from("work_orders")
    .select(WORK_ORDER_WORKSPACE_SELECT)
    .eq("shop_id", shopId)
    .eq(column, value)
    .maybeSingle();
  throwQueryError(result.error, "Unable to load Work Order workspace identity");
  return (result.data as WorkspaceWorkOrderRow | null) ?? null;
}

async function resolveVisibleWorkOrder(
  supabase: SupabaseClient<Database>,
  shopId: string,
  routeId: string,
): Promise<WorkspaceWorkOrderRow | null> {
  if (UUID_PATTERN.test(routeId)) {
    const byId = await loadExactWorkOrder(supabase, shopId, "id", routeId);
    if (byId) return byId;
  }

  const byExactCustomId = await loadExactWorkOrder(
    supabase,
    shopId,
    "custom_id",
    routeId,
  );
  if (byExactCustomId) return byExactCustomId;

  // Keep this bootstrap additive to the existing client resolver. It supports
  // the same common case-insensitive alias while leaving the current client
  // loader authoritative if no unique server match can be proven.
  if (!routeId.includes("%") && !routeId.includes("_")) {
    const caseInsensitiveResult = await supabase
      .from("work_orders")
      .select(WORK_ORDER_WORKSPACE_SELECT)
      .eq("shop_id", shopId)
      .ilike("custom_id", routeId.toUpperCase())
      .limit(2);
    throwQueryError(
      caseInsensitiveResult.error,
      "Unable to resolve Work Order workspace alias",
    );
    const caseInsensitiveRows = (caseInsensitiveResult.data ?? []) as WorkspaceWorkOrderRow[];
    if (caseInsensitiveRows.length === 1) return caseInsensitiveRows[0];
    if (caseInsensitiveRows.length > 1) return null;
  }

  const normalizedRoute = normalizedCustomIdReference(routeId);
  if (!normalizedRoute) return null;

  const candidatesResult = await supabase
    .from("work_orders")
    .select(WORK_ORDER_WORKSPACE_SELECT)
    .eq("shop_id", shopId)
    .ilike("custom_id", `${normalizedRoute.prefix}%`)
    .limit(50);
  throwQueryError(
    candidatesResult.error,
    "Unable to resolve normalized Work Order workspace alias",
  );

  const matches = ((candidatesResult.data ?? []) as WorkspaceWorkOrderRow[]).filter(
    (row) => customIdReferencesMatch(row.custom_id, routeId),
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Loads only the trusted identity needed to bootstrap sibling Work Order
 * workspace modules. The authenticated RLS client remains the visibility
 * boundary; the existing client cockpit still owns operational reads and all
 * mutations in this compatible-integration slice.
 */
export async function loadWorkOrderWorkspaceSnapshot(input: {
  supabase: SupabaseClient<Database>;
  shopId: string;
  routeId: string;
}): Promise<WorkOrderWorkspaceServerSnapshot | null> {
  const shopId = input.shopId.trim();
  const routeId = input.routeId.trim();
  if (!shopId || !routeId) return null;

  const workOrder = await resolveVisibleWorkOrder(
    input.supabase,
    shopId,
    routeId,
  );
  if (!workOrder || workOrder.shop_id !== shopId) return null;

  const resource = createWorkOrderWorkspaceResource({
    shopId: workOrder.shop_id,
    workOrderId: workOrder.id,
    customerId: workOrder.customer_id,
    vehicleId: workOrder.vehicle_id,
  });
  if (!resource) return null;

  return {
    routeId,
    resource,
    workOrder: {
      id: workOrder.id,
      shopId: workOrder.shop_id,
      customerId: workOrder.customer_id,
      vehicleId: workOrder.vehicle_id,
      customId: workOrder.custom_id,
      status: workOrder.status,
      paymentStatus: workOrder.payment_status,
      approvalState: workOrder.approval_state,
      recordType: workOrder.record_type,
    },
  };
}

/**
 * Best-effort server bootstrap for the existing Work Order screen. Returning
 * null preserves its current client-side authentication, retry, and not-found
 * behavior when the server snapshot is unavailable.
 */
export async function loadCurrentWorkOrderWorkspaceSnapshot(input: {
  routeId: string;
}): Promise<WorkOrderWorkspaceServerSnapshot | null> {
  try {
    const supabase = createServerSupabaseRSC();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return null;

    const { profile, error: profileError } =
      await resolveAuthenticatedStaffProfile(supabase, user.id);
    const actor = getActorCapabilities({ role: profile?.role });
    if (
      profileError ||
      !profile?.shop_id ||
      !actor.isKnownRole ||
      !(WORK_ORDER_WORKSPACE_READER_ROLES as readonly CanonicalRole[]).includes(
        actor.canonicalRole,
      )
    ) {
      return null;
    }

    return loadWorkOrderWorkspaceSnapshot({
      supabase,
      shopId: profile.shop_id,
      routeId: input.routeId,
    });
  } catch (error) {
    console.error("[Work Order Workspace] server bootstrap failed", error);
    return null;
  }
}
