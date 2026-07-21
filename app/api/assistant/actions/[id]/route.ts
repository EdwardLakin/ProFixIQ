import { NextResponse } from "next/server";
import type { Json } from "@shared/types/types/supabase";
import type { AssistantExecutionResult } from "@/features/agent/assistant/types";
import { executeShopAssistantAction } from "@/features/assistant/server/shopAssistantActionExecutor";
import { asShopAssistantClient } from "@/features/assistant/server/shopAssistantDatabase";
import {
  appendAssistantMessage,
  loadAssistantActionRequest,
  updateAssistantActionRequest,
} from "@/features/assistant/server/shopAssistantPersistence";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };
type DecisionBody = { decision?: "confirm" | "cancel" };

function storedExecution(value: Json | null): AssistantExecutionResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json | undefined>;
  if (
    typeof record.actionId !== "string" ||
    typeof record.toolName !== "string" ||
    (record.status !== "succeeded" &&
      record.status !== "failed" &&
      record.status !== "cancelled") ||
    typeof record.summary !== "string"
  ) {
    return null;
  }

  return value as unknown as AssistantExecutionResult;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid action id" }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as DecisionBody | null;
  if (body?.decision !== "confirm" && body?.decision !== "cancel") {
    return NextResponse.json(
      { error: "Decision must be confirm or cancel" },
      { status: 400 },
    );
  }

  const client = asShopAssistantClient(access.supabase);

  try {
    const action = await loadAssistantActionRequest(client, {
      actionId: id,
      shopId: access.profile.shop_id,
      userId: access.profile.id,
    });

    if (!action) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    const previousExecution = storedExecution(action.result);
    if (previousExecution) {
      return NextResponse.json({
        ok: true,
        conversationId: action.conversation_id,
        execution: previousExecution,
      });
    }

    if (body.decision === "cancel") {
      if (action.status !== "pending") {
        return NextResponse.json(
          { error: `Action is already ${action.status}` },
          { status: 409 },
        );
      }

      const execution: AssistantExecutionResult = {
        actionId: action.id,
        toolName: action.tool_name,
        status: "cancelled",
        summary: `${action.label} was cancelled. No shop records were changed.`,
        details: [],
        affectedRecords: [],
      };

      const updated = await updateAssistantActionRequest(client, {
        actionId: action.id,
        shopId: access.profile.shop_id,
        userId: access.profile.id,
        expectedStatus: "pending",
        patch: {
          status: "cancelled",
          result: execution as unknown as Json,
          executed_at: new Date().toISOString(),
        },
      });

      if (!updated) {
        return NextResponse.json(
          { error: "Action changed before it could be cancelled" },
          { status: 409 },
        );
      }

      await appendAssistantMessage(client, {
        conversationId: action.conversation_id,
        shopId: access.profile.shop_id,
        userId: access.profile.id,
        role: "assistant",
        content: execution.summary,
        requestId: `action:${action.id}:cancel`,
        payload: { execution },
      });

      return NextResponse.json({
        ok: true,
        conversationId: action.conversation_id,
        execution,
      });
    }

    if (action.status !== "pending") {
      return NextResponse.json(
        { error: `Action is already ${action.status}` },
        { status: 409 },
      );
    }

    if (new Date(action.expires_at).getTime() <= Date.now()) {
      await updateAssistantActionRequest(client, {
        actionId: action.id,
        shopId: access.profile.shop_id,
        userId: access.profile.id,
        expectedStatus: "pending",
        patch: {
          status: "expired",
          error_message: "Confirmation window expired",
          executed_at: new Date().toISOString(),
        },
      });
      return NextResponse.json(
        { error: "This action expired. Ask the assistant to prepare it again." },
        { status: 409 },
      );
    }

    const claimed = await updateAssistantActionRequest(client, {
      actionId: action.id,
      shopId: access.profile.shop_id,
      userId: access.profile.id,
      expectedStatus: "pending",
      patch: {
        status: "executing",
        confirmed_by: access.profile.id,
        confirmed_at: new Date().toISOString(),
      },
    });

    if (!claimed) {
      return NextResponse.json(
        { error: "Action changed before it could be confirmed" },
        { status: 409 },
      );
    }

    try {
      const execution = await executeShopAssistantAction({
        client,
        actionId: action.id,
        shopId: access.profile.shop_id,
        profileId: access.profile.id,
        role: access.profile.role,
        toolName: action.tool_name,
        input: action.input,
      });

      await updateAssistantActionRequest(client, {
        actionId: action.id,
        shopId: access.profile.shop_id,
        userId: access.profile.id,
        expectedStatus: "executing",
        patch: {
          status: "succeeded",
          result: execution as unknown as Json,
          error_message: null,
          executed_at: new Date().toISOString(),
        },
      });

      await appendAssistantMessage(client, {
        conversationId: action.conversation_id,
        shopId: access.profile.shop_id,
        userId: access.profile.id,
        role: "assistant",
        content: [execution.summary, ...execution.details].join("\n"),
        requestId: `action:${action.id}:result`,
        payload: { execution },
      });

      return NextResponse.json({
        ok: true,
        conversationId: action.conversation_id,
        execution,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "The requested action failed";
      const execution: AssistantExecutionResult = {
        actionId: action.id,
        toolName: action.tool_name,
        status: "failed",
        summary: `I could not complete ${action.label.toLowerCase()}.`,
        details: [message],
        affectedRecords: [],
      };

      await updateAssistantActionRequest(client, {
        actionId: action.id,
        shopId: access.profile.shop_id,
        userId: access.profile.id,
        expectedStatus: "executing",
        patch: {
          status: "failed",
          result: execution as unknown as Json,
          error_message: message,
          executed_at: new Date().toISOString(),
        },
      });

      await appendAssistantMessage(client, {
        conversationId: action.conversation_id,
        shopId: access.profile.shop_id,
        userId: access.profile.id,
        role: "assistant",
        content: [execution.summary, message].join("\n"),
        requestId: `action:${action.id}:result`,
        payload: { execution },
      });

      return NextResponse.json({
        ok: true,
        conversationId: action.conversation_id,
        execution,
      });
    }
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process assistant action",
      },
      { status: 500 },
    );
  }
}
