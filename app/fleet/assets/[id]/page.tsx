export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

interface FleetAssetPageProps {
  params: Promise<{ id: string }>;
}

type DB = Database;

export default async function FleetAssetPage({ params }: FleetAssetPageProps) {
  const { id } = await params;
  const supabase = createServerComponentClient<DB>({ cookies });
  const uiContext = await resolveFleetUiContext(supabase);

  return <AssetDetailScreen unitId={id} uiContext={uiContext} />;
}
