import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceVisit } from "@/features/dispatch/server/commands";
import { dispatchErrorResponse } from "@/features/dispatch/server/http";
import {
  assertServiceVisitAnchor,
  assertServiceVisitSchedule,
} from "@/features/scheduling/lib/service-visit-contract";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const BodySchema = z
  .object({
    bookingId: z.string().uuid().nullable().optional(),
    workOrderId: z.string().uuid().nullable().optional(),
    mode: z.enum(["shop", "mobile"]),
    serviceAddressId: z.string().uuid().nullable().optional(),
    scheduledStart: z.string().datetime({ offset: true }).nullable().optional(),
    scheduledEnd: z.string().datetime({ offset: true }).nullable().optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
    serviceVehicleId: z.string().uuid().nullable().optional(),
    dispatchNotes: z.string().max(4000).nullable().optional(),
    estimatedTravelMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
    estimatedDistanceKm: z.number().min(0).max(100_000).nullable().optional(),
    operationKey: z.string().trim().min(8).max(300).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.bookingId && !value.workOrderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A bookingId or workOrderId is required.",
        path: ["workOrderId"],
      });
    }
    if (Boolean(value.scheduledStart) !== Boolean(value.scheduledEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduledStart and scheduledEnd must be provided together.",
        path: ["scheduledEnd"],
      });
    }
    if (value.mode !== "mobile" && value.serviceVehicleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A service vehicle can only be assigned to a mobile visit.",
        path: ["serviceVehicleId"],
      });
    }
  });

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid service visit.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  try {
    assertServiceVisitAnchor(input);
    assertServiceVisitSchedule(input.scheduledStart, input.scheduledEnd);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid service visit." },
      { status: 400 },
    );
  }

  const operationKey =
    request.headers.get("Idempotency-Key")?.trim() || input.operationKey?.trim();
  if (!operationKey || operationKey.length < 8) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  try {
    const result = await createServiceVisit({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      actorUserId: access.profile.id,
      operationKey,
      bookingId: input.bookingId,
      workOrderId: input.workOrderId,
      mode: input.mode,
      serviceAddressId: input.serviceAddressId,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      assignedUserId: input.assignedUserId,
      serviceVehicleId: input.serviceVehicleId,
      dispatchNotes: input.dispatchNotes,
      estimatedTravelMinutes: input.estimatedTravelMinutes,
      estimatedDistanceKm: input.estimatedDistanceKm,
    });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return dispatchErrorResponse(error);
  }
}
