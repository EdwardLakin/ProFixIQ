import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@shared/types/types/supabase";

export type AssistantConversationRow = {
  id: string;
  shop_id: string;
  user_id: string;
  title: string | null;
  context: Json;
  last_intent: string | null;
  created_at: string;
  updated_at: string;
};

export type AssistantMessageRow = {
  id: string;
  conversation_id: string;
  shop_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  payload: Json;
  message_key: string;
  created_at: string;
};

export type AssistantActionRequestStatus =
  | "pending"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export type AssistantActionRequestRow = {
  id: string;
  conversation_id: string;
  shop_id: string;
  requested_by: string;
  confirmed_by: string | null;
  tool_name: string;
  domain: string;
  label: string;
  summary: string;
  risk_level: "low" | "medium" | "high";
  input: Json;
  result: Json | null;
  error_message: string | null;
  status: AssistantActionRequestStatus;
  idempotency_key: string;
  expires_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
};

type AssistantPersistenceDatabase = {
  public: {
    Tables: {
      assistant_conversations: {
        Row: AssistantConversationRow;
        Insert: {
          id?: string;
          shop_id: string;
          user_id: string;
          title?: string | null;
          context?: Json;
          last_intent?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Pick<
            AssistantConversationRow,
            "title" | "context" | "last_intent" | "updated_at"
          >
        >;
        Relationships: [];
      };
      assistant_messages: {
        Row: AssistantMessageRow;
        Insert: {
          id?: string;
          conversation_id: string;
          shop_id: string;
          user_id: string;
          role: "user" | "assistant";
          content: string;
          payload?: Json;
          message_key: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      assistant_action_requests: {
        Row: AssistantActionRequestRow;
        Insert: {
          id?: string;
          conversation_id: string;
          shop_id: string;
          requested_by: string;
          confirmed_by?: string | null;
          tool_name: string;
          domain: string;
          label: string;
          summary: string;
          risk_level?: "low" | "medium" | "high";
          input?: Json;
          result?: Json | null;
          error_message?: string | null;
          status?: AssistantActionRequestStatus;
          idempotency_key: string;
          expires_at?: string;
          confirmed_at?: string | null;
          executed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Pick<
            AssistantActionRequestRow,
            | "confirmed_by"
            | "result"
            | "error_message"
            | "status"
            | "expires_at"
            | "confirmed_at"
            | "executed_at"
            | "updated_at"
          >
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      assistant_set_work_order_hold: {
        Args: {
          p_shop_id: string;
          p_actor_profile_id: string;
          p_work_order_reference: string;
          p_reason: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ShopAssistantSupabaseClient =
  SupabaseClient<AssistantPersistenceDatabase>;

/**
 * The migration and this narrow database overlay are kept together until the
 * next generated Supabase type refresh. It avoids weakening the application-wide
 * client type while allowing the newly added assistant tables to be used safely.
 */
export function asShopAssistantClient(
  client: unknown,
): ShopAssistantSupabaseClient {
  return client as ShopAssistantSupabaseClient;
}
