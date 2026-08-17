import "server-only";

import { z } from "zod";

import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { defineShopAssistantTool } from "../types";

const MessageResultSchema = z.object({
  ok: z.literal(true),
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  recipients: z.array(z.string().uuid()),
  sentAt: z.string(),
  summary: z.string(),
  href: z.string(),
});

async function loadConversationAccess(
  conversationId: string,
  actorUserId: string,
  expectedShopId: string,
) {
  const admin = createAdminSupabase();
  const access = await authorizeConversationActor({
    supabase: admin,
    conversationId,
    actorUserId,
  });
  if (!access.ok) {
    if (access.status >= 500) throw new Error(access.error);
    throw new ShopAssistantHttpError(access.status, access.error);
  }
  if (access.actor.shopId !== expectedShopId) {
    throw new ShopAssistantHttpError(
      403,
      "Conversation belongs to another shop.",
    );
  }
  return { admin, access };
}

export const sendConversationMessageTool = defineShopAssistantTool({
  name: "send_conversation_message",
  domain: "customer_communications",
  description:
    "Send a reviewed message to an existing authorized conversation.",
  mode: "write",
  risk: "high",
  requiredCapability: "canInvitePortalCustomers",
  confirmation: "required",
  inputSchema: z.object({
    conversationId: z.string().uuid(),
    content: z.string().trim().min(1).max(10_000),
  }),
  outputSchema: MessageResultSchema,
  async preview(input, context) {
    const { access } = await loadConversationAccess(
      input.conversationId,
      context.actor.userId,
      context.actor.shopId,
    );
    const recipients = access.participantUserIds
      .filter((userId) => userId !== context.actor.userId)
      .sort();
    const recipientCount = recipients.length;

    return {
      title: "Send customer conversation message",
      summary: input.content,
      consequences: [
        `This message will be sent immediately to ${recipientCount} other conversation participant(s).`,
        "Sent messages remain in the conversation history.",
      ],
      targetVersions: {
        [`conversation_participants:${input.conversationId}`]:
          recipients.join(","),
      },
      metadata: {
        conversationId: input.conversationId,
        recipientCount,
        channel: access.conversation.channel,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required to send an idempotent message.",
      );
    }

    const { admin, access } = await loadConversationAccess(
      input.conversationId,
      context.actor.userId,
      context.actor.shopId,
    );
    const { data: existing, error: existingError } = await admin
      .from("messages")
      .select("id, conversation_id, recipients, sent_at")
      .eq("conversation_id", input.conversationId)
      .eq("sender_participant_id", access.actorParticipant.id)
      .eq("client_message_id", context.actionId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existing) {
      return {
        ok: true as const,
        messageId: existing.id,
        conversationId: existing.conversation_id,
        recipients: (existing.recipients ?? []) as string[],
        sentAt: existing.sent_at,
        summary:
          "The message had already been sent; the existing result was returned.",
        href: `/chat?conversationId=${encodeURIComponent(input.conversationId)}`,
      };
    }

    const recipients = access.participantUserIds
      .filter((userId) => userId !== context.actor.userId)
      .sort();
    const expectedRecipients =
      context.targetVersions?.[
        `conversation_participants:${input.conversationId}`
      ];
    if (
      expectedRecipients == null ||
      expectedRecipients !== recipients.join(",")
    ) {
      throw new ShopAssistantHttpError(
        409,
        "The conversation participants changed after preview. Ask again before sending.",
      );
    }

    const sentAt = new Date().toISOString();
    const { data, error } = await admin
      .from("messages")
      .insert({
        conversation_id: input.conversationId,
        sender_id: context.actor.userId,
        sender_participant_id: access.actorParticipant.id,
        sender_kind: "staff",
        recipients,
        content: input.content,
        sent_at: sentAt,
        attachments: [],
        metadata: {
          source: "shop_assistant",
          actionId: context.actionId,
          actor_kind: "staff",
        },
        client_message_id: context.actionId,
      })
      .select("id, conversation_id, recipients, sent_at")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to send conversation message.");
    }

    return {
      ok: true as const,
      messageId: data.id,
      conversationId: data.conversation_id,
      recipients: (data.recipients ?? []) as string[],
      sentAt: data.sent_at,
      summary: `Message sent to ${recipients.length} participant(s).`,
      href: `/chat?conversationId=${encodeURIComponent(input.conversationId)}`,
    };
  },
});
