import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

export type CurrentActor = {
  user: User | null;
  profile: ProfileRow | null;
  shopId: string | null;
  role: ProfileRow["role"] | null;
};

export async function resolveCurrentActor(
  supabase: SupabaseClient<DB>,
): Promise<CurrentActor> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      profile: null,
      shopId: null,
      role: null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .maybeSingle();

  return {
    user,
    profile: profile ?? null,
    shopId: profile?.shop_id ?? null,
    role: profile?.role ?? null,
  };
}
