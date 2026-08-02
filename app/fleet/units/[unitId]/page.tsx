import Container from "@shared/components/ui/Container";
import FleetUnitDetailWorkspace from "@/features/fleet/components/FleetUnitDetailWorkspace";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type Props = { params: Promise<{ unitId: string }> };

export default async function FleetUnitDetailPage({ params }: Props) {
  const { unitId } = await params;
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[color:var(--theme-surface-page)]">
      <Container className="py-6">
        <FleetUnitDetailWorkspace
          unitId={unitId}
          uiContext={uiContext}
          routePrefix="/fleet"
        />
      </Container>
    </main>
  );
}
