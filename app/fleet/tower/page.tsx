import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import Container from "@shared/components/ui/Container";
import FleetControlTower from "@/features/fleet/components/FleetControlTower";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";


type ProfileWithShop = {
  id: string;
  shop_id: string | null;
  shops?: { name: string | null } | null;
  shop_name?: string | null;
};

export default async function FleetTowerPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase);
  const uiContext = getFleetUiContext(actor);

  let shopName = "Fleet";
  let shopId: string | null = actor.shopId ?? null;

  if (actor.userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, shop_id, shops(name), shop_name")
      .or(`id.eq.${actor.userId},user_id.eq.${actor.userId}`)
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
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />
      <Container className="py-6">
        <FleetControlTower shopName={shopName} shopId={shopId} uiContext={uiContext} />
      </Container>
    </main>
  );
}
