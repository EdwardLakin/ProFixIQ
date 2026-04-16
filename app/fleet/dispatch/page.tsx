export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import FleetDispatchBoard from "@/features/fleet/components/FleetDispatchBoard";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type DB = Database;

export default async function Page() {
  const supabase = createServerComponentClient<DB>({ cookies });
  const uiContext = await resolveFleetUiContext(supabase);

  return <FleetDispatchBoard uiContext={uiContext} />;
}
