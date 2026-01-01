// app/fleet/assets/[id]/page.tsx

export const dynamic = "force-dynamic";
export const revalidate = 0;

import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";

type PageProps = {
  params: {
    id: string;
  };
};

export default function FleetAssetDetailPage({ params }: PageProps) {
  const unitId = params.id;

  // Basic guard – if somehow there's no id, we just don't render anything meaningful.
  // (You could swap this for notFound() if you prefer a 404.)
  if (!unitId) {
    return null;
  }

  return <AssetDetailScreen unitId={unitId} />;
}