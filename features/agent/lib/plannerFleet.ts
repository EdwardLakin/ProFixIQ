// features/agent/lib/plannerFleet.ts
import type { ToolContext } from "./toolTypes";
import type { PlannerEvent } from "./plannerSimple";
import {
  runFindOrCreateFleet,
  runGenerateFleetWorkOrders,
} from "./toolRegistry";

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}

type ParsedFleetPlan = {
  fleetName?: string;
  programName?: string;
  label?: string;
  vehicleIds?: string[];
};

/**
 * Very small helper to build a fleet plan from goal + context.
 * (You can swap this later for an LLM parser if you want richer behavior.)
 */
function buildFleetPlan(goal: string, context: Record<string, unknown>): ParsedFleetPlan {
  // Allow caller to pass structured fields in context, and fall back to goal text.
  const fleetNameCtx = get<string>(context, "fleetName");
  const programCtx = get<string>(context, "programName");
  const labelCtx = get<string>(context, "label");
  const vehicleIdsCtx = get<string[]>(context, "vehicleIds");

  const trimmedGoal = goal.trim();
  const fallbackFleetName =
    fleetNameCtx ||
    (trimmedGoal.length > 0 ? trimmedGoal.slice(0, 80) : undefined);

  return {
    fleetName: fleetNameCtx ?? fallbackFleetName,
    programName: programCtx ?? get<string>(context, "program") ?? "Maintenance Program",
    label: labelCtx ?? undefined,
    vehicleIds: Array.isArray(vehicleIdsCtx) ? vehicleIdsCtx : undefined,
  };
}

export async function runFleetPlanner(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: (e: PlannerEvent) => Promise<void> | void,
) {
  // Use ParsedFleetPlan so TS is happy and our inputs are normalized
  const plan: ParsedFleetPlan = buildFleetPlan(goal, context);

  await onEvent?.({ kind: "plan", text: `Fleet goal: ${goal}` });

  if (!plan.fleetName) {
    await onEvent?.({
      kind: "final",
      text: "Fleet planner needs at least a fleet name in goal or context.fleetName.",
    });
    return;
  }

  // 1) Find or create fleet
  const findInput: Record<string, unknown> = {
    fleetName: plan.fleetName,
    label: plan.label,
  };

  await onEvent?.({
    kind: "tool_call",
    name: "find_or_create_fleet",
    input: findInput,
  });

  // use `any` to stay tolerant of the exact tool typings
  const fleetOut = await (runFindOrCreateFleet as any)(findInput, ctx);
  await onEvent?.({
    kind: "tool_result",
    name: "find_or_create_fleet",
    output: fleetOut,
  });

  const fleetId: string | undefined =
    (fleetOut && (fleetOut.fleetId || fleetOut.id)) ?? undefined;

  if (!fleetId) {
    await onEvent?.({
      kind: "final",
      text: "Could not resolve fleet ID from find_or_create_fleet.",
    });
    return;
  }

  // 2) Generate work orders for the fleet / program
  const generateInput: Record<string, unknown> = {
    fleetId,
    programName: plan.programName,
    vehicleIds: plan.vehicleIds,
  };

  await onEvent?.({
    kind: "tool_call",
    name: "generate_fleet_work_orders",
    input: generateInput,
  });

  const generated = await (runGenerateFleetWorkOrders as any)(
    generateInput,
    ctx,
  );

  await onEvent?.({
    kind: "tool_result",
    name: "generate_fleet_work_orders",
    output: generated,
  });

  await onEvent?.({
    kind: "final",
    text: "Fleet work orders generated.",
  });
}