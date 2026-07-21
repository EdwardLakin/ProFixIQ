import type { Database as GeneratedDatabase, Json } from "./supabase";

export type ShopAssistantStateSnapshotsTable = {
  Row: {
    expires_at: string;
    invalidated_at: string | null;
    refreshed_at: string;
    role: string | null;
    shop_id: string;
    snapshot: Json;
    updated_at: string;
    user_id: string;
    version: number;
  };
  Insert: {
    expires_at?: string;
    invalidated_at?: string | null;
    refreshed_at?: string;
    role?: string | null;
    shop_id: string;
    snapshot?: Json;
    updated_at?: string;
    user_id: string;
    version?: number;
  };
  Update: {
    expires_at?: string;
    invalidated_at?: string | null;
    refreshed_at?: string;
    role?: string | null;
    shop_id?: string;
    snapshot?: Json;
    updated_at?: string;
    user_id?: string;
    version?: number;
  };
  Relationships: [];
};

type GeneratedPublicSchema = GeneratedDatabase["public"];

/**
 * Migration-scoped database overlay for schema added after the checked-in
 * generated Supabase baseline. This keeps state-cache reads, writes, and RPCs
 * fully typed without weakening the global generated database contract.
 */
export type ShopAssistantDatabase = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedPublicSchema, "Tables" | "Functions"> & {
    Tables: GeneratedPublicSchema["Tables"] & {
      shop_assistant_state_snapshots: ShopAssistantStateSnapshotsTable;
    };
    Functions: GeneratedPublicSchema["Functions"] & {
      invalidate_shop_assistant_state_snapshots: {
        Args: {
          p_actor_user_id: string;
          p_shop_id: string;
        };
        Returns: number;
      };
    };
  };
};

export type ShopAssistantStateSnapshotRow =
  ShopAssistantStateSnapshotsTable["Row"];
