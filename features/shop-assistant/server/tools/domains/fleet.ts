import "server-only";

import { z } from "zod";

import {
  resolveFleetActorContext,
  type FleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import type { ShopAssistantToolContext } from "../types";
import { defineShopAssistantTool, runShopAssistantCommandRpc } from "../types";

const FleetUnitSchema = z.object({
  vehicleId: z.string().uuid(),
  fleetId: z.string().uuid(),
  fleetName: z.string(),
  label: z.string(),
  year: z.number().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  plate: z.string().nullable(),
  vin: z.string().nullable(),
  href: z.string(),
});

const FleetRequestSchema = z.object({
  serviceRequestId: z.string().uuid(),
  fleetId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  title: z.string(),
  severity: z.string().nullable(),
  status: z.string(),
  requestedForDate: z.string().nullable(),
  workOrderId: z.string().uuid().nullable(),
  createdAt: z.string(),
  href: z.string(),
});

const CreateFleetServiceRequestResultSchema = z.object({
  ok: z.literal(true),
  serviceRequestId: z.string().uuid(),
  summary: z.string(),
  href: z.string(),
});

const ConvertFleetServiceRequestResultSchema = z.object({
  ok: z.literal(true),
  workOrderId: z.string().uuid(),
  conversionStatus: z.string(),
  summary: z.string(),
  href: z.string(),
});

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fleetActor(
  context: ShopAssistantToolContext,
): Promise<FleetActorContext> {
  const actor = await resolveFleetActorContext(createAdminSupabase(), {
    userId: context.actor.userId,
    profileId: context.actor.profileId,
  });
  if (!actor.userId || actor.shopId !== context.actor.shopId) {
    throw new ShopAssistantHttpError(
      403,
      "Fleet access is not available for this account.",
    );
  }
  return actor;
}

async function allowedFleetIds(
  context: ShopAssistantToolContext,
): Promise<string[]> {
  const actor = await fleetActor(context);
  return actor.fleetIds;
}

async function loadAccessibleFleetServiceRequest(
  context: ShopAssistantToolContext,
  serviceRequestId: string,
) {
  const fleetIds = await allowedFleetIds(context);
  if (fleetIds.length === 0) {
    throw new ShopAssistantHttpError(
      403,
      "Fleet access is not available for this account.",
    );
  }

  const { data, error } = await createAdminSupabase()
    .from("fleet_service_requests")
    .select("id, fleet_id, title, status, work_order_id, updated_at")
    .eq("shop_id", context.actor.shopId)
    .eq("id", serviceRequestId)
    .in("fleet_id", fleetIds)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new ShopAssistantHttpError(
      404,
      "Fleet service request not found in an accessible fleet.",
    );
  }
  return data;
}

async function resolveFleetForVehicle(params: {
  context: ShopAssistantToolContext;
  vehicleId: string;
  requestedFleetId?: string;
}): Promise<string> {
  const ids = await allowedFleetIds(params.context);
  if (params.requestedFleetId && !ids.includes(params.requestedFleetId)) {
    throw new ShopAssistantHttpError(
      403,
      "That fleet is outside your fleet access.",
    );
  }
  const admin = createAdminSupabase();
  let query = admin
    .from("fleet_vehicles")
    .select("fleet_id")
    .eq("shop_id", params.context.actor.shopId)
    .eq("vehicle_id", params.vehicleId)
    .or("active.is.null,active.eq.true");
  query = params.requestedFleetId
    ? query.eq("fleet_id", params.requestedFleetId)
    : query.in("fleet_id", ids);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const matches = [...new Set((data ?? []).map((row) => row.fleet_id))];
  if (matches.length === 0) {
    throw new ShopAssistantHttpError(
      404,
      "That vehicle is not actively enrolled in an accessible fleet.",
    );
  }
  if (matches.length > 1) {
    throw new ShopAssistantHttpError(
      400,
      "This vehicle belongs to more than one accessible fleet; specify the fleet.",
    );
  }
  return matches[0];
}

export const listFleetUnitsTool = defineShopAssistantTool({
  name: "list_fleet_units",
  domain: "fleet",
  description:
    "List fleet units visible to the current internal or fleet-management actor.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canViewFleetOnlyData", "canViewShopWideData"],
  confirmation: "never",
  inputSchema: z.object({
    fleetId: z.string().uuid().optional(),
    query: z.string().trim().max(100).optional(),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    units: z.array(FleetUnitSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const fleetIds = await allowedFleetIds(context);
    const scopedIds = input.fleetId
      ? fleetIds.includes(input.fleetId)
        ? [input.fleetId]
        : []
      : fleetIds;
    if (input.fleetId && scopedIds.length === 0) {
      throw new ShopAssistantHttpError(
        403,
        "That fleet is outside your fleet access.",
      );
    }
    if (scopedIds.length === 0) {
      return {
        ok: true as const,
        units: [],
        summary: "No fleet units are available to this account.",
        href: "/fleet/units",
      };
    }
    const admin = createAdminSupabase();
    const { data: fleets, error: fleetError } = await admin
      .from("fleets")
      .select("id, name")
      .in("id", scopedIds);
    if (fleetError) throw new Error(fleetError.message);
    const fleetNames = new Map(
      (fleets ?? []).map((fleet) => [fleet.id, fleet.name ?? "Fleet"]),
    );
    const token = input.query?.toLowerCase();
    const units: Array<z.infer<typeof FleetUnitSchema>> = [];
    const pageSize = token ? 500 : input.limit;

    // A fleet can contain thousands of active enrollments. Page the stable
    // enrollment order until enough post-filter matches are found so a VIN,
    // plate, unit, make, or model cannot disappear behind an arbitrary cap.
    for (let from = 0; units.length < input.limit; from += pageSize) {
      const { data: enrollments, error } = await admin
        .from("fleet_vehicles")
        .select(
          "fleet_id, vehicle_id, nickname, vehicles!inner(id, year, make, model, unit_number, license_plate, vin)",
        )
        .eq("shop_id", context.actor.shopId)
        .in("fleet_id", scopedIds)
        .or("active.is.null,active.eq.true")
        .order("fleet_id", { ascending: true })
        .order("vehicle_id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = rows(enrollments);

      for (const enrollment of page) {
        const relation = Array.isArray(enrollment.vehicles)
          ? enrollment.vehicles[0]
          : enrollment.vehicles;
        const vehicle =
          relation && typeof relation === "object" ? (relation as Row) : {};
        const vehicleId = clean(enrollment.vehicle_id);
        const fleetId = clean(enrollment.fleet_id);
        if (!vehicleId || !fleetId) continue;
        const label =
          clean(enrollment.nickname) ??
          clean(vehicle.unit_number) ??
          clean(vehicle.license_plate) ??
          clean(vehicle.vin) ??
          "Unit";
        const searchable = [
          label,
          vehicle.make,
          vehicle.model,
          vehicle.license_plate,
          vehicle.vin,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (token && !searchable.includes(token)) continue;
        units.push({
          vehicleId,
          fleetId,
          fleetName: fleetNames.get(fleetId) ?? "Fleet",
          label,
          year:
            vehicle.year == null || !Number.isFinite(Number(vehicle.year))
              ? null
              : Number(vehicle.year),
          make: clean(vehicle.make),
          model: clean(vehicle.model),
          plate: clean(vehicle.license_plate),
          vin: clean(vehicle.vin),
          href: `/fleet/assets/${vehicleId}`,
        });
        if (units.length >= input.limit) break;
      }

      if (page.length < pageSize) break;
    }
    return {
      ok: true as const,
      units,
      summary: `${units.length} accessible fleet unit(s) matched.`,
      href: "/fleet/units",
    };
  },
});

export const listFleetServiceRequestsTool = defineShopAssistantTool({
  name: "list_fleet_service_requests",
  domain: "fleet",
  description:
    "List service requests for fleets visible to the current fleet or internal actor.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canViewFleetOnlyData", "canViewShopWideData"],
  confirmation: "never",
  inputSchema: z.object({
    fleetId: z.string().uuid().optional(),
    vehicleId: z.string().uuid().optional(),
    status: z.string().trim().max(50).optional(),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    requests: z.array(FleetRequestSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const fleetIds = await allowedFleetIds(context);
    const scopedIds = input.fleetId
      ? fleetIds.includes(input.fleetId)
        ? [input.fleetId]
        : []
      : fleetIds;
    if (input.fleetId && scopedIds.length === 0) {
      throw new ShopAssistantHttpError(
        403,
        "That fleet is outside your fleet access.",
      );
    }
    if (scopedIds.length === 0) {
      return {
        ok: true as const,
        requests: [],
        summary: "No fleet service requests are available to this account.",
        href: "/fleet/service-requests",
      };
    }
    let query = createAdminSupabase()
      .from("fleet_service_requests")
      .select(
        "id, fleet_id, vehicle_id, title, severity, status, requested_for_date, work_order_id, created_at",
      )
      .eq("shop_id", context.actor.shopId)
      .in("fleet_id", scopedIds)
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (input.vehicleId) query = query.eq("vehicle_id", input.vehicleId);
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const requests = (data ?? []).map((request) => ({
      serviceRequestId: request.id,
      fleetId: request.fleet_id,
      vehicleId: request.vehicle_id,
      title: request.title,
      severity: request.severity ?? null,
      status: request.status,
      requestedForDate: request.requested_for_date ?? null,
      workOrderId: request.work_order_id ?? null,
      createdAt: request.created_at,
      href: request.work_order_id
        ? `/work-orders/${request.work_order_id}`
        : "/fleet/service-requests",
    }));
    return {
      ok: true as const,
      requests,
      summary: `${requests.length} fleet service request(s) matched.`,
      href: "/fleet/service-requests",
    };
  },
});

export const createFleetServiceRequestTool = defineShopAssistantTool({
  name: "create_fleet_service_request",
  domain: "fleet",
  description:
    "Create one structured custom fleet service request for an accessible enrolled unit.",
  mode: "write",
  risk: "medium",
  requiredAnyCapabilities: ["canManageFleetApprovals", "canViewShopWideData"],
  allowedRoles: ["owner", "admin", "manager", "fleet_manager"],
  confirmation: "required",
  inputSchema: z.object({
    fleetId: z.string().uuid().optional(),
    vehicleId: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(4000),
    requestedForDate: z.string().date().optional(),
  }),
  outputSchema: CreateFleetServiceRequestResultSchema,
  async preview(input, context) {
    const fleetId = await resolveFleetForVehicle({
      context,
      vehicleId: input.vehicleId,
      requestedFleetId: input.fleetId,
    });
    return {
      title: `Create fleet service request: ${input.title}`,
      summary: input.summary,
      consequences: [
        "A structured fleet service request and one custom request line will be created atomically.",
        "The shop will review the request before it becomes a work order.",
        input.requestedForDate
          ? `Requested service date: ${input.requestedForDate}.`
          : "No requested service date will be set.",
      ],
      targetVersions: {
        [`fleet_vehicle:${input.vehicleId}`]: fleetId,
      },
      metadata: { fleetId, vehicleId: input.vehicleId },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for a fleet service request.");
    }
    const confirmedFleetId =
      context.targetVersions?.[`fleet_vehicle:${input.vehicleId}`];
    if (!confirmedFleetId) {
      throw new ShopAssistantHttpError(
        409,
        "The confirmed fleet scope is missing. Ask again to review this request.",
      );
    }
    const fleetId = await resolveFleetForVehicle({
      context,
      vehicleId: input.vehicleId,
      requestedFleetId: confirmedFleetId,
    });
    if (fleetId !== confirmedFleetId) {
      throw new ShopAssistantHttpError(
        409,
        "The vehicle's fleet enrollment changed after preview. Ask again to review its current fleet.",
      );
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_create_fleet_service_request_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_fleet_id: fleetId,
        p_vehicle_id: input.vehicleId,
        p_title: input.title,
        p_summary: input.summary,
        p_requested_for_date: input.requestedForDate ?? null,
      },
    );
    return CreateFleetServiceRequestResultSchema.parse(data);
  },
});

export const convertFleetServiceRequestTool = defineShopAssistantTool({
  name: "convert_fleet_service_request_to_work_order",
  domain: "fleet",
  description:
    "Convert one same-shop structured fleet service request into its canonical work order. Replays return the already-linked work order.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageWorkOrders",
  allowedRoles: ["owner", "admin", "manager", "advisor"],
  confirmation: "required",
  inputSchema: z.object({ serviceRequestId: z.string().uuid() }),
  outputSchema: ConvertFleetServiceRequestResultSchema,
  async preview(input, context) {
    const data = await loadAccessibleFleetServiceRequest(
      context,
      input.serviceRequestId,
    );
    return {
      title: `Convert fleet request: ${data.title}`,
      summary: data.work_order_id
        ? "This request is already linked; confirmation will return its existing work order."
        : "Create a structured shop work order from this fleet request.",
      consequences: [
        "Request lines will be copied into canonical work-order job lines.",
        "The fleet request will link to the work order and move to scheduled.",
        "A replay returns the existing linked work order instead of duplicating it.",
      ],
      targetVersions: {
        [`fleet_service_request:${data.id}`]: data.updated_at ?? "missing",
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required to convert a fleet request.");
    }
    await loadAccessibleFleetServiceRequest(context, input.serviceRequestId);
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_convert_fleet_service_request_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_service_request_id: input.serviceRequestId,
      },
    );
    return ConvertFleetServiceRequestResultSchema.parse(data);
  },
});
