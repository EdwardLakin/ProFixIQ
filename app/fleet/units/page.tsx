import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import Container from "@shared/components/ui/Container";
import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";


export default async function FleetUnitsRoutePage() {
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return (
    <main className="relative min-h-[calc(100vh-3rem)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[var(--theme-gradient-panel)]"
      />
      <Container className="py-6">
        <FleetUnitsPage uiContext={uiContext} />
      </Container>
    </main>
  );
}
