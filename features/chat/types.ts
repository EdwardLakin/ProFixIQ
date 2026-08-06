import type { Database } from "@/features/shared/types/types/supabase";

export type MessageActorKind = "staff" | "customer";

export type ChatMessage = Database["public"]["Tables"]["messages"]["Row"] & {
  sender_kind: MessageActorKind | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  is_mine: boolean;
  can_delete: boolean;
};
