import "server-only";

import {
  createPendingAction,
  mapActionPreview,
  mapActionResult,
} from "@/features/shop-assistant/server/actions/actionStore";
import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  getShopAssistantTool,
  previewShopAssistantWriteTool,
  runShopAssistantReadTool,
} from "@/features/shop-assistant/server/tools/registry";
import type {
  ShopAssistantActionPreview,
  ShopAssistantActionResult,
  ShopAssistantContext,
  ShopAssistantDomain,
  ShopAssistantMessage,
  ShopAssistantThreadContext,
} from "@/features/shop-assistant/types";
import {
  formatShopAssistantToolOutput,
  recordOutput,
} from "./formatToolOutput";
import {
  planShopAssistantTurn,
  type ShopAssistantPlannedCall,
} from "./planner";

export type OrchestratedShopAssistantResult =
  | {
      kind: "read_result";
      content: string;
      outputs: Array<{
        toolName: string;
        domain: ShopAssistantDomain;
        output: Record<string, unknown>;
      }>;
      planner: { mode: "ai" | "fallback"; model: string; warning?: string };
      resolvedContext?: ShopAssistantThreadContext;
    }
  | {
      kind: "confirmation_required";
      content: string;
      action: ShopAssistantActionPreview;
      planner: { mode: "ai" | "fallback"; model: string; warning?: string };
      resolvedContext?: ShopAssistantThreadContext;
    }
  | {
      kind: "action_result";
      content: string;
      action: ShopAssistantActionResult;
      planner: { mode: "ai" | "fallback"; model: string; warning?: string };
      resolvedContext?: ShopAssistantThreadContext;
    }
  | {
      kind: "clarification_required";
      content: string;
      fields: Array<{
        name: string;
        label: string;
        type: "text" | "select" | "date" | "datetime";
        required?: boolean;
      }>;
      planner: { mode: "ai" | "fallback"; model: string; warning?: string };
    }
  | {
      kind: "technician_delegate";
      content: string;
      href: string;
      planner: { mode: "ai" | "fallback"; model: string; warning?: string };
    }
  | {
      kind: "informational";
      planner: { mode: "ai" | "fallback"; model: string; warning?: string };
    };

async function shopClock(actor: ShopAssistantActor) {
  const { data, error } = await actor.supabase
    .from("shops")
    .select("timezone")
    .eq("id", actor.shopId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const timezone = data?.timezone?.trim() || "UTC";
  const { getShopDayRange } = await import(
    "@/features/shared/lib/utils/shopDayWindow"
  );
  const today = getShopDayRange(timezone, new Date());
  return {
    now: new Date().toISOString(),
    timezone: today.timezone,
    todayStart: today.start,
    todayEnd: today.end,
  };
}

function contextForDomain(
  current: ShopAssistantThreadContext,
  domain?: ShopAssistantDomain,
): ShopAssistantThreadContext {
  return domain ? { ...current, lastDomain: domain } : current;
}

type ExecutedRead = {
  toolName: string;
  domain: ShopAssistantDomain;
  output: Record<string, unknown>;
  content: string;
};

async function executeReadCalls(params: {
  actor: ShopAssistantActor;
  threadId: string;
  clientMessageId: string;
  calls: ShopAssistantPlannedCall[];
  phase: string;
}): Promise<ExecutedRead[]> {
  return Promise.all(
    params.calls.map(async (call, index) => {
      const output = await runShopAssistantReadTool({
        name: call.name,
        input: call.input,
        context: {
          actor: params.actor,
          threadId: params.threadId,
          idempotencyKey: `${params.threadId}:${params.clientMessageId}:${params.phase}:${call.name}:${index}`,
        },
      });
      return {
        toolName: call.name,
        domain: getShopAssistantTool(call.name).domain,
        output: recordOutput(output),
        content: formatShopAssistantToolOutput(call.name, output),
      };
    }),
  );
}

export async function orchestrateShopAssistantTurn(params: {
  actor: ShopAssistantActor;
  threadId: string;
  clientMessageId: string;
  question: string;
  pageContext?: ShopAssistantContext;
  threadContext: ShopAssistantThreadContext;
  messages: ShopAssistantMessage[];
}): Promise<OrchestratedShopAssistantResult> {
  const clock = await shopClock(params.actor);
  const planned = await planShopAssistantTurn({
    actor: params.actor,
    question: params.question,
    pageContext: params.pageContext,
    threadContext: params.threadContext,
    messages: params.messages,
    clock,
  });
  let activePlanned = planned;
  let resolutionOutputs: ExecutedRead[] = [];

  if (
    planned.plan.kind === "tools" &&
    planned.plan.intent === "prepare_write" &&
    planned.plan.calls.every((call) => call.mode === "read")
  ) {
    resolutionOutputs = await executeReadCalls({
      actor: params.actor,
      threadId: params.threadId,
      clientMessageId: params.clientMessageId,
      calls: planned.plan.calls,
      phase: "resolve",
    });
    activePlanned = await planShopAssistantTurn({
      actor: params.actor,
      question: params.question,
      pageContext: params.pageContext,
      threadContext: params.threadContext,
      messages: params.messages,
      clock,
      resolutionResults: resolutionOutputs.map(({ toolName, output }) => ({
        toolName,
        output,
      })),
    });
  }

  const planner = {
    mode: activePlanned.mode,
    model: activePlanned.model,
    warning: [planned.warning, activePlanned.warning]
      .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
      .join(" | ") || undefined,
  };
  const plan = activePlanned.plan;

  if (plan.kind === "informational") {
    if (resolutionOutputs.length > 0) {
      return {
        kind: "read_result",
        content: resolutionOutputs.map((output) => output.content).join("\n\n"),
        outputs: resolutionOutputs.map(({ toolName, domain, output }) => ({
          toolName,
          domain,
          output,
        })),
        planner,
        resolvedContext: contextForDomain(
          params.threadContext,
          resolutionOutputs.length === 1
            ? resolutionOutputs[0]?.domain
            : undefined,
        ),
      };
    }
    return { kind: "informational", planner };
  }
  if (plan.kind === "technician_delegate") {
    const workOrderId =
      params.pageContext?.workOrderId ?? params.threadContext.activeWorkOrderId;
    return {
      kind: "technician_delegate",
      content: plan.message,
      href: workOrderId
        ? `/work-orders/${encodeURIComponent(workOrderId)}`
        : "/work-orders",
      planner,
    };
  }
  if (plan.kind === "clarification") {
    return {
      kind: "clarification_required",
      content: [
        resolutionOutputs.map((output) => output.content).join("\n\n"),
        plan.message,
      ]
        .filter(Boolean)
        .join("\n\n"),
      fields: [
        {
          name: "answer",
          label: "Add the missing detail",
          type: "text",
        },
      ],
      planner,
    };
  }

  const writeCall = plan.calls.find((call) => call.mode === "write");
  if (writeCall) {
    const idempotencyKey = `${params.threadId}:${params.clientMessageId}:${writeCall.name}`;
    const prepared = await previewShopAssistantWriteTool({
      name: writeCall.name,
      input: writeCall.input,
      context: {
        actor: params.actor,
        threadId: params.threadId,
        idempotencyKey,
      },
    });
    const actionWrite = await createPendingAction({
      actor: params.actor,
      threadId: params.threadId,
      toolName: prepared.metadata.name,
      domain: prepared.metadata.domain,
      risk: prepared.metadata.risk,
      input: prepared.input,
      preview: prepared.preview,
      idempotencyKey,
    });
    if (
      actionWrite.row.status === "succeeded" ||
      actionWrite.row.status === "failed" ||
      actionWrite.row.status === "cancelled" ||
      actionWrite.row.status === "expired"
    ) {
      const action = mapActionResult(actionWrite.row);
      return {
        kind: "action_result",
        content: action.summary,
        action,
        planner,
        resolvedContext: contextForDomain(
          params.threadContext,
          prepared.metadata.domain,
        ),
      };
    }
    const action = mapActionPreview(actionWrite.row);
    return {
      kind: "confirmation_required",
      content: `${action.title}\n${action.summary}`,
      action,
      planner,
      resolvedContext: contextForDomain(
        params.threadContext,
        prepared.metadata.domain,
      ),
    };
  }

  if (resolutionOutputs.length > 0) {
    return {
      kind: "clarification_required",
      content: `${resolutionOutputs
        .map((output) => output.content)
        .join("\n\n")}\n\nI found matching records but could not safely resolve one exact target. Which record should I use?`,
      fields: [
        {
          name: "answer",
          label: "Identify the exact record",
          type: "text",
        },
      ],
      planner,
    };
  }

  const outputs = await executeReadCalls({
    actor: params.actor,
    threadId: params.threadId,
    clientMessageId: params.clientMessageId,
    calls: plan.calls,
    phase: "answer",
  });

  return {
    kind: "read_result",
    content: outputs.map((output) => output.content).join("\n\n"),
    outputs: outputs.map(({ toolName, domain, output }) => ({
      toolName,
      domain,
      output,
    })),
    planner,
    resolvedContext: contextForDomain(
      params.threadContext,
      outputs.length === 1 ? outputs[0]?.domain : undefined,
    ),
  };
}
