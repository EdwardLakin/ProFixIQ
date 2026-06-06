import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type Props = {
  params: Promise<{ unitId: string }>;
};

export default async function PortalFleetUnitPage({ params }: Props) {
  const { unitId } = await params;
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return (
    <AssetDetailScreen
      unitId={unitId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
