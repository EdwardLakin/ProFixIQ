import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";
import { upsertPortalNotification } from "@/features/portal/server/upsertPortalNotification";

const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";

function dualRoleClient(): SupabaseClient<Database> {
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          or: () => ({
            maybeSingle: async () => ({
              data: {
                id: "profile-1",
                user_id: userId,
                shop_id: "shop-1",
                role: "advisor",
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "customers") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "customer-1",
                user_id: userId,
                shop_id: "shop-1",
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "conversations") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: conversationId,
                channel: "customer",
                customer_id: "customer-1",
                shop_id: "shop-1",
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "conversation_participants") {
      return {
        select: () => ({
          eq: async () => ({
            data: [
              {
                id: "customer-participant",
                conversation_id: conversationId,
                user_id: userId,
                participant_kind: "customer",
                customer_id: "customer-1",
                profile_id: null,
                role: "customer",
                added_at: null,
              },
              {
                id: "staff-participant",
                conversation_id: conversationId,
                user_id: userId,
                participant_kind: "staff",
                customer_id: null,
                profile_id: "profile-1",
                role: "advisor",
                added_at: null,
              },
            ],
            error: null,
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from } as unknown as SupabaseClient<Database>;
}

describe("actor-scoped messaging and notifications", () => {
  it("selects independent customer and staff actors for one auth user", async () => {
    const client = dualRoleClient();
    const customer = await authorizeConversationActor({
      supabase: client,
      conversationId,
      actorUserId: userId,
      preferredKind: "customer",
    });
    const staff = await authorizeConversationActor({
      supabase: client,
      conversationId,
      actorUserId: userId,
      preferredKind: "staff",
    });

    expect(customer.ok && customer.actorParticipant.id).toBe(
      "customer-participant",
    );
    expect(staff.ok && staff.actorParticipant.id).toBe("staff-participant");
  });

  it("writes idempotent, navigable portal notifications", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as SupabaseClient<Database>;

    await upsertPortalNotification(client, {
      userId,
      customerId: "customer-1",
      workOrderId: "work-order-1",
      kind: "invoice_ready",
      title: "Invoice ready",
      eventKey: "invoice:1",
      href: "/portal/invoices/work-order-1",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_key: "invoice:1",
        metadata: { href: "/portal/invoices/work-order-1" },
      }),
      { onConflict: "user_id,event_key" },
    );
  });

  it("migrates sender identity, actor deliveries, and private Broadcast", () => {
    const migration = readFileSync(
      "supabase/migrations/20260806030134_actor_scoped_messaging_notifications.sql",
      "utf8",
    );

    expect(migration).toContain(
      "conversation_participants_actor_identity_uidx",
    );
    expect(migration).toContain("sender_participant_id");
    expect(migration).toContain(
      "create table if not exists public.message_deliveries",
    );
    expect(migration).toContain("'message_received'");
    expect(migration).toContain(
      "'room:' || v_conversation_id::text || ':messages'",
    );
    expect(migration).toContain("on conflict (user_id, event_key) do nothing");
  });

  it("keeps legacy read watermarks compatible while deliveries stay actor-scoped", () => {
    const markReadRoute = readFileSync(
      "app/api/chat/mark-read/route.ts",
      "utf8",
    );
    const compatibilityMigration = readFileSync(
      "supabase/migrations/20260806033550_preserve_legacy_messaging_transition.sql",
      "utf8",
    );

    expect(markReadRoute).toContain(
      '.eq("recipient_participant_id", access.actorParticipant.id)',
    );
    expect(markReadRoute).toContain(
      '{ onConflict: "user_id,conversation_id" }',
    );
    expect(compatibilityMigration).toContain(
      "message_reads_conversation_user_uidx",
    );
    expect(compatibilityMigration).toContain(
      "v_requested_kind is null",
    );
  });
});
