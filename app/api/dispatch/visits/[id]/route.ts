import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assignServiceVisit,
  rescheduleServiceVisit,
  transitionServiceVisit,
  updateServiceVisit,
} from "@/features/dispatch/server/commands";
import { dispatchErrorResponse } from "@/features/dispatch/server/http";
import { assertServiceVisitSchedule } from "@/features/scheduling/lib/service-visit-contract";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  canAccessDispatchVisit,
  resolveDispatchProductScope,
} from "@/features/dispatch/server/productScope";

const CommonSchema = z.object({
  expectedVersion: z.number().int().positive().nullable().optional(),
  operationKey: z.string().trim().min(8).max(300).optional(),
});

const UpdateSchema = CommonSchema.extend({
  action: z.literal("update"),
  workOrderId: z.string().uuid().nullable().optional(),
  serviceAddressId: z.string().uuid().nullable().optional(),
  dispatchNotes: z.string().max(4000).nullable().optional(),
  estimatedTravelMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .nullable()
    .optional(),
  estimatedDistanceKm: z.number().min(0).max(100_000).nullable().optional(),
});

const RescheduleSchema = CommonSchema.extend({
  action: z.literal("reschedule"),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

const AssignSchema = CommonSchema.extend({
  action: z.literal("assign"),
  assignedUserId: z.string().uuid().nullable(),
  serviceVehicleId: z.string().uuid().nullable(),
});

const TransitionSchema = CommonSchema.extend({
  action: z.literal("transition"),
  toStatus: z.enum([
    "scheduled",
    "dispatched",
    "en_route",
    "arrived",
    "working",
    "paused",
    "completed",
    "cancelled",
  ]),
  actualTravelMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .nullable()
    .optional(),
  actualDistanceKm: z.number().min(0).max(100_000).nullable().optional(),
});

const BodySchema = z.discriminatedUnion("action", [
  UpdateSchema,
  RescheduleSchema,
  AssignSchema,
  TransitionSchema,
]);

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid service visit id." },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid dispatch operation.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const actor = getActorCapabilities({ role: access.profile.role });
  const input = parsed.data;
  const canManage = actor.canManageScheduling;
  const canTransition = canManage || actor.canPerformAssignedWork;

  if (input.action === "transition" ? !canTransition : !canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const productScope = await resolveDispatchProductScope(access);
    if (
      !(await canAccessDispatchVisit({
        access,
        scope: productScope,
        visitId: id,
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json(
      { error: "Unable to authorize this dispatch operation." },
      { status: 503 },
    );
  }

  const operationKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    input.operationKey?.trim();
  if (!operationKey || operationKey.length < 8) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  try {
    if (input.action === "reschedule") {
      assertServiceVisitSchedule(input.startsAt, input.endsAt);
      const result = await rescheduleServiceVisit({
        supabase: access.supabase,
        shopId: access.profile.shop_id,
        visitId: id,
        actorUserId: access.profile.id,
        operationKey,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        expectedVersion: input.expectedVersion,
      });
      return NextResponse.json(result);
    }

    if (input.action === "assign") {
      const result = await assignServiceVisit({
        supabase: access.supabase,
        shopId: access.profile.shop_id,
        visitId: id,
        actorUserId: access.profile.id,
        operationKey,
        assignedUserId: input.assignedUserId,
        serviceVehicleId: input.serviceVehicleId,
        expectedVersion: input.expectedVersion,
      });
      return NextResponse.json(result);
    }

    if (input.action === "transition") {
      const result = await transitionServiceVisit({
        supabase: access.supabase,
        shopId: access.profile.shop_id,
        visitId: id,
        actorUserId: access.profile.id,
        operationKey,
        toStatus: input.toStatus,
        actualTravelMinutes: input.actualTravelMinutes,
        actualDistanceKm: input.actualDistanceKm,
        expectedVersion: input.expectedVersion,
      });
      return NextResponse.json(result);
    }

    // PATCH semantics: omitted fields preserve their current value; explicit
    // null clears a nullable field. The write itself still goes through the
    // command-owned RPC and optimistic version check.
    const { data: current, error: currentError } = await access.supabase
      .from("service_visits")
      .select(
        "work_order_id, service_address_id, dispatch_notes, estimated_travel_minutes, estimated_distance_km",
      )
      .eq("id", id)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) {
      return NextResponse.json(
        { error: "Service visit not found." },
        { status: 404 },
      );
    }

    const result = await updateServiceVisit({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      visitId: id,
      actorUserId: access.profile.id,
      operationKey,
      expectedVersion: input.expectedVersion,
      workOrderId: hasOwn(input, "workOrderId")
        ? input.workOrderId
        : current.work_order_id,
      serviceAddressId: hasOwn(input, "serviceAddressId")
        ? input.serviceAddressId
        : current.service_address_id,
      dispatchNotes: hasOwn(input, "dispatchNotes")
        ? input.dispatchNotes
        : current.dispatch_notes,
      estimatedTravelMinutes: hasOwn(input, "estimatedTravelMinutes")
        ? input.estimatedTravelMinutes
        : current.estimated_travel_minutes,
      estimatedDistanceKm: hasOwn(input, "estimatedDistanceKm")
        ? input.estimatedDistanceKm
        : current.estimated_distance_km == null
          ? null
          : Number(current.estimated_distance_km),
    });
    return NextResponse.json(result);
  } catch (error) {
    return dispatchErrorResponse(error);
  }
}
