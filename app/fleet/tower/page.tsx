// app/fleet/tower/page.tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Container from "@shared/components/ui/Container";
import FleetControlTower from "@/features/fleet/components/FleetControlTower";

type DB = Database;

type ProfileWithShop = {
  id: string;
  shop_id: string | null;
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
      .select("id, shop_id, shops(name), shop_name")
      .eq("user_id", user.id)
      .maybeSingle<ProfileWithShop>();

    if (profile?.shop_id) {
      shopId = profile.shop_id;
    }

    const fromJoin = profile?.shops?.name ?? profile?.shop_name ?? null;

    if (fromJoin && typeof fromJoin === "string") {
      shopName = fromJoin;
    }
  }

  return (
    <main className="relative min-h-[calc(100vh-3rem)] bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />
      <Container className="py-6">
        <FleetControlTower shopName={shopName} shopId={shopId} />
      </Container>
    </main>
  );
}