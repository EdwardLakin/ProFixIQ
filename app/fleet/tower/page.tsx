// app/fleet/tower/page.tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import FleetControlTower from "@/features/fleet/components/FleetControlTower";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type ProfileWithShop = ProfileRow & {
  shops?: { name: string | null } | null;
  shop_name?: string | null;
};

export default async function FleetTowerPage() {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shopName = "Fleet";
  let shopId: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, shop_id, shops(name)")
      .eq("user_id", user.id)
      .maybeSingle<ProfileWithShop>();

    if (profile?.shop_id) {
      shopId = profile.shop_id as string;
    }

    const fromJoin =
      profile?.shops?.name ?? profile?.shop_name ?? null;

    if (fromJoin && typeof fromJoin === "string") {
      shopName = fromJoin;
    }
  }

  return <FleetControlTower shopName={shopName} shopId={shopId} />;
}