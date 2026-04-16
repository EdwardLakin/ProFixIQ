import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import FleetServiceRequestsPage from "@/features/fleet/components/FleetServiceRequestsPage";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type DB = Database;

export default async function PortalFleetServiceRequestsPage() {
  const supabase = createServerComponentClient<DB>({ cookies });
  const uiContext = await resolveFleetUiContext(supabase);

  return <FleetServiceRequestsPage uiContext={uiContext} />;
}
