import { z } from "zod";

const uuid = z.string().uuid();

const visitFields = {
  mode: z.enum(["shop", "mobile"]).default("mobile"),
  serviceAddressId: uuid.nullable().optional(),
  scheduledStart: z.string().datetime({ offset: true }).nullable().optional(),
  scheduledEnd: z.string().datetime({ offset: true }).nullable().optional(),
  leadUserId: uuid.nullable().optional(),
  supportUserIds: z.array(uuid).max(10).default([]),
  serviceVehicleId: uuid.nullable().optional(),
  dispatchNotes: z.string().max(4000).nullable().optional(),
  /** true = dispatch immediately; false = leave scheduled for later dispatch. */
  dispatchNow: z.boolean().default(false),
};

type VisitRefinable = {
  mode: "shop" | "mobile";
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  serviceVehicleId?: string | null;
  dispatchNow: boolean;
  leadUserId?: string | null;
  supportUserIds: string[];
  serviceAddressId?: string | null;
};

function refineVisit(value: VisitRefinable, ctx: z.RefinementCtx) {
  const issue = (message: string, path: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });

  if (Boolean(value.scheduledStart) !== Boolean(value.scheduledEnd)) {
    issue("scheduledStart and scheduledEnd must be provided together.", "scheduledEnd");
  }
  if (value.scheduledStart && value.scheduledEnd) {
    const start = Date.parse(value.scheduledStart);
    const end = Date.parse(value.scheduledEnd);
    if (!(end > start)) issue("The visit must end after it starts.", "scheduledEnd");
  }
  if (value.dispatchNow && value.scheduledStart) {
    issue("Choose Now or a scheduled time, not both.", "dispatchNow");
  }
  if (value.mode !== "mobile" && value.serviceVehicleId) {
    issue("A service vehicle can only be assigned to a field visit.", "serviceVehicleId");
  }
  if (!value.leadUserId && value.supportUserIds.length > 0) {
    issue("Choose a lead technician before adding supporting technicians.", "leadUserId");
  }
  if (value.leadUserId && value.supportUserIds.includes(value.leadUserId)) {
    issue("The lead technician is already on the visit.", "supportUserIds");
  }
  if (value.dispatchNow && !value.leadUserId) {
    issue("Choose a technician to dispatch now.", "leadUserId");
  }
  if (value.dispatchNow && value.mode === "mobile" && !value.serviceAddressId) {
    issue("Choose the jobsite location to dispatch a field visit.", "serviceAddressId");
  }
}

export const DispatchWorkOrderSchema = z
  .object({ workOrderId: uuid, ...visitFields })
  .superRefine(refineVisit);

export const FieldCallSchema = z
  .object({
    customerId: uuid,
    vehicleId: uuid,
    complaint: z.string().trim().min(3).max(4000),
    priority: z.number().int().min(1).max(5).default(3),
    ...visitFields,
    mode: z.literal("mobile").default("mobile"),
  })
  .superRefine(refineVisit);

export type DispatchWorkOrderInput = z.infer<typeof DispatchWorkOrderSchema>;
export type FieldCallInput = z.infer<typeof FieldCallSchema>;

export type DispatchParticipant = { userId: string | null; role: "lead" | "support" };

export type DispatchNotification = {
  recipientUserId: string;
  eventType: "dispatch.assigned";
  dedupeKey: string;
  title: string;
  body: string;
  targetPath: string;
  priority: "normal" | "high";
};

/**
 * One assignment notification per technician on the visit. The dedupe key is
 * stable per (visit, technician), so retries, replays and double taps can never
 * notify twice. The dispatcher is not notified about their own action. Customer
 * messages are intentionally not produced here.
 */
export function buildDispatchNotifications(input: {
  visitId: string;
  workOrderId: string;
  workOrderLabel?: string | null;
  participants: DispatchParticipant[];
  actorProfileId: string | null;
  dispatchedNow: boolean;
}): DispatchNotification[] {
  const label = input.workOrderLabel ? ` (${input.workOrderLabel})` : "";
  return input.participants
    .filter((p): p is { userId: string; role: "lead" | "support" } => Boolean(p.userId))
    .filter((p) => p.userId !== input.actorProfileId)
    .map((p) => ({
      recipientUserId: p.userId,
      eventType: "dispatch.assigned" as const,
      dedupeKey: `equipment:dispatch.assigned:${input.visitId}:${p.userId}`,
      title: p.role === "lead" ? `You are the lead on a field job${label}` : `You were added to a field job${label}`,
      body: input.dispatchedNow
        ? "Dispatched now. Open the job to acknowledge."
        : "A visit was scheduled for you. Open the job for details.",
      targetPath: `/mobile/work-orders/${input.workOrderId}`,
      priority: input.dispatchedNow ? ("high" as const) : ("normal" as const),
    }));
}
