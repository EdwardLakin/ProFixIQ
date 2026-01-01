import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";

interface FleetAssetPageProps {
  params: { id: string };
}

export default function FleetAssetPage({ params }: FleetAssetPageProps) {
  return <AssetDetailScreen unitId={params.id} />;
}