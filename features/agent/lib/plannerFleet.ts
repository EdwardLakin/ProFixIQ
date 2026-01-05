// features/agent/lib/plannerFleet.ts
import type { ToolContext } from "./toolTypes";
import type { PlannerEvent } from "./plannerSimple";
import {
  runFindOrCreateFleet,
  runFindOrCreateFleetProgram,
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
  contactEmail?: string;
  contactName?: string;
  baseTemplateSlug?: string;
  includeCustomInspection?: boolean;
  allowCreate?: boolean; // NEW
};

/**
 * Very small helper to build a fleet plan from goal + context.
 * (You can swap this later for an LLM parser if you want richer behavior.)
 */
function buildFleetPlan(goal: string, context: Record<string, unknown>): ParsedFleetPlan {
  const fleetNameCtx = get<string>(context, "fleetName");
  const programCtx = get<string>(context, "programName");
  const labelCtx = get<string>(context, "label");
  const vehicleIdsCtx = get<string[]>(context, "vehicleIds");

  const contactEmailCtx = get<string>(context, "contactEmail");
  const contactNameCtx = get<string>(context, "contactName");

  const baseTemplateSlugCtx = get<string>(context, "baseTemplateSlug");
  const includeCustomInspectionCtx = get<boolean>(context, "includeCustomInspection");

  const allowCreate =
    get<boolean>(context, "allowCreate") === true ||
    get<boolean>(context, "allow_create") === true;

  const trimmedGoal = goal.trim();
  const fallbackFleetName =
    fleetNameCtx || (trimmedGoal.length > 0 ? trimmedGoal.slice(0, 80) : undefined);

  return {
    fleetName: fleetNameCtx ?? fallbackFleetName,
    programName: programCtx ?? get<string>(context, "program") ?? "Maintenance Program",
    label: labelCtx ?? undefined,
    vehicleIds: Array.isArray(vehicleIdsCtx) ? vehicleIdsCtx : undefined,
    contactEmail: contactEmailCtx ?? undefined,
    contactName: contactNameCtx ?? undefined,
    baseTemplateSlug: baseTemplateSlugCtx ?? undefined,
    includeCustomInspection:
      typeof includeCustomInspectionCtx === "boolean" ? includeCustomInspectionCtx : undefined,
    allowCreate,
  };
}

export async function runFleetPlanner(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: (e: PlannerEvent) => Promise<void> | void,
) {
  const plan: ParsedFleetPlan = buildFleetPlan(goal, context);

  await onEvent?.({ kind: "plan", text: `Fleet goal: ${goal}` });

  if (!plan.fleetName) {
    await onEvent?.({
      kind: "final",
      text: "Fleet planner needs at least a fleet name in goal or context.fleetName.",
    });
    return;
  }

  // IMPORTANT: default behavior is “NO DB creation”.
  // You must explicitly pass context.allowCreate=true to create fleets/programs.
  if (!plan.allowCreate) {
    await onEvent?.({
      kind: "final",
      text:
        "Fleet planner is in existing-data mode (allowCreate=false). " +
        "Select an existing fleet/program in the Fleet UI, or rerun with allowCreate=true for setup.",
    });
    return;
  }

  // 1) Find or create fleet
  const findFleetInput = {
    name: plan.fleetName,
    contact_email: plan.contactEmail,
    contact_name: plan.contactName,
  };

  await onEvent?.({
    kind: "tool_call",
    name: "find_or_create_fleet",
    input: findFleetInput,
  });

  const fleetOut = await runFindOrCreateFleet(findFleetInput, ctx);

  await onEvent?.({
    kind: "tool_result",
    name: "find_or_create_fleet",
    output: fleetOut,
  });

  const fleetId = fleetOut?.fleetId;

  if (!fleetId) {
    await onEvent?.({
      kind: "final",
      text: "Could not resolve fleet ID from find_or_create_fleet.",
    });
    return;
  }

  // 2) Find or create fleet program (persist it even if no tasks yet)
  const programName = plan.programName ?? "Maintenance Program";
  const findProgramInput = {
    fleetId,
    programName,
    baseTemplateSlug: plan.baseTemplateSlug,
    includeCustomInspection: plan.includeCustomInspection,
  };

  await onEvent?.({
    kind: "tool_call",
    name: "find_or_create_fleet_program",
    input: findProgramInput,
  });

  const programOut = await runFindOrCreateFleetProgram(findProgramInput, ctx);

  await onEvent?.({
    kind: "tool_result",
    name: "find_or_create_fleet_program",
    output: programOut,
  });

  const programId = programOut?.programId;

  // 3) Generate work orders for the fleet / program
  const generateInput = {
    fleetId,
    programName,
    vehicleIds: plan.vehicleIds,
    label: plan.label,
  };

  await onEvent?.({
    kind: "tool_call",
    name: "generate_fleet_work_orders",
    input: generateInput,
  });

  const generated = await runGenerateFleetWorkOrders(generateInput, ctx);

  await onEvent?.({
    kind: "tool_result",
    name: "generate_fleet_work_orders",
    output: {
      ...generated,
      programId: programId ?? null,
    },
  });

  await onEvent?.({
    kind: "final",
    text: `Fleet work orders generated.${programId ? ` Program ${programId.slice(0, 8)}…` : ""}`,
  });
}