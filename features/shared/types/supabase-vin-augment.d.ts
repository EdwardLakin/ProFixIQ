// features/shared/types/supabase-vin-augment.d.ts
import type { Database } from "@shared/types/types/supabase";

declare module "@shared/types/types/supabase" {
  interface Database {
    public: Database["public"] & {
      Tables: Database["public"]["Tables"] & {
        vin_decodes: {
          Row: {
            vin: string;
            user_id: string | null;
            year: string | null;
            make: string | null;
            model: string | null;
            trim: string | null;
            engine: string | null;
            created_at: string;
          };
          Insert: {
            vin: string;
            user_id?: string | null;
            year?: string | null;
            make?: string | null;
            model?: string | null;
            trim?: string | null;
            engine?: string | null;
            created_at?: string;
          };
          Update: {
            vin?: string;
            user_id?: string | null;
            year?: string | null;
            make?: string | null;
            model?: string | null;
            trim?: string | null;
            engine?: string | null;
            created_at?: string;
          };
          Relationships: [
            {
              foreignKeyName: "vin_decodes_user_id_fkey";
              columns: ["user_id"];
              isOneToOne: false;
              referencedRelation: "users";
              referencedColumns: ["id"];
            }
          ];
        };
      };
    };
  }
}