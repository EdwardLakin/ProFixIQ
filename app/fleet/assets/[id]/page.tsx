import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";

export default function Page({ params }: { params: { id: string } }) {
  return <AssetDetailScreen unitId={params.id} />;
}