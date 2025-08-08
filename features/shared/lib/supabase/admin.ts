import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
