import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import FleetControlTower from "@/features/fleet/components/FleetControlTower";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type DB = Database;

export default async function PortalFleetPage() {
  const supabase = createServerComponentClient<DB>({ cookies });
  const actor = await resolveFleetActorContext(supabase);
  const uiContext = getFleetUiContext(actor);

  return (
    <FleetControlTower
      shopName="Fleet Portal"
      shopId={actor.shopId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
