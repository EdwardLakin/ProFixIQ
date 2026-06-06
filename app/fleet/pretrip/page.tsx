export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import PretripReportsPage from "@/features/fleet/components/PretripReportsPage";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";


export default async function Page() {
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return <PretripReportsPage uiContext={uiContext} />;
}
