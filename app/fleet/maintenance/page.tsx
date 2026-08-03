import Container from "@shared/components/ui/Container";
import FleetMaintenanceWorkspace from "@/features/fleet/components/FleetMaintenanceWorkspace";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

export default async function FleetMaintenancePage() {
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[color:var(--theme-surface-page)]">
      <Container className="py-6">
        <FleetMaintenanceWorkspace uiContext={uiContext} routePrefix="/fleet" />
      </Container>
    </main>
  );
}
