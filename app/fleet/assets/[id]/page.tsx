// app/fleet/assets/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";

export default function FleetAssetPage({
  params,
}: {
  params: { id: string };
}) {
  return <AssetDetailScreen unitId={params.id} />;
}