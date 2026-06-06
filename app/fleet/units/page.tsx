import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import Container from "@shared/components/ui/Container";
import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";


export default async function FleetUnitsRoutePage() {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase);
  const uiContext = await resolveFleetUiContext(supabase);

  return (
    <main className="relative min-h-[calc(100vh-3rem)] bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />
      <Container className="py-6">
        <FleetUnitsPage shopId={actor.shopId} uiContext={uiContext} />
      </Container>
    </main>
  );
}
