import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type DB = Database;
type Props = {
  params: Promise<{ unitId: string }>;
};

export default async function PortalFleetUnitPage({ params }: Props) {
  const { unitId } = await params;
  const supabase = createServerComponentClient<DB>({ cookies });
  const uiContext = await resolveFleetUiContext(supabase);

  return (
    <AssetDetailScreen
      unitId={unitId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
