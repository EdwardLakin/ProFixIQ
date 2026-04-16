import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PretripReportsPage from "@/features/fleet/components/PretripReportsPage";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type DB = Database;

export default async function PortalFleetPretripHistoryPage() {
  const supabase = createServerComponentClient<DB>({ cookies });
  const uiContext = await resolveFleetUiContext(supabase);

  return <PretripReportsPage uiContext={uiContext} routePrefix="/portal/fleet" />;
}
