import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { asShopAssistantClient } from "@/features/assistant/server/shopAssistantDatabase";
import {
  deleteAssistantConversation,
  listAssistantMessages,
  loadAssistantConversation,
} from "@/features/assistant/server/shopAssistantPersistence";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  try {
    const client = asShopAssistantClient(access.supabase);
    const conversation = await loadAssistantConversation(client, {
      conversationId: id,
      shopId: access.profile.shop_id,
      userId: access.profile.id,
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const messages = await listAssistantMessages(client, {
      conversationId: id,
      shopId: access.profile.shop_id,
      userId: access.profile.id,
      limit: 50,
    });

    return NextResponse.json({
      ok: true,
      conversation: {
        id: conversation.id,
        context: conversation.context,
        lastIntent: conversation.last_intent,
        updatedAt: conversation.updated_at,
      },
      messages,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load assistant conversation",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  try {
    const deleted = await deleteAssistantConversation(
      asShopAssistantClient(access.supabase),
      {
        conversationId: id,
        shopId: access.profile.shop_id,
        userId: access.profile.id,
      },
    );

    if (!deleted) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to clear assistant conversation",
      },
      { status: 500 },
    );
  }
}
