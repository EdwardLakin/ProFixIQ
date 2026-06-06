export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

interface FleetAssetPageProps {
  params: Promise<{ id: string }>;
}


export default async function FleetAssetPage({ params }: FleetAssetPageProps) {
  const { id } = await params;
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return <AssetDetailScreen unitId={id} uiContext={uiContext} />;
}
