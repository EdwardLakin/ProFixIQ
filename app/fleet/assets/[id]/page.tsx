// app/fleet/assets/[id]/page.tsx

export const dynamic = "force-dynamic";
export const revalidate = 0;

import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";

type AssetDetailPageProps = {
  params: {
    id: string;
  };
};

export default function Page({ params }: AssetDetailPageProps) {
  const unitId = params.id;

  // If somehow there's no id, render nothing (or you could throw notFound()).
  if (!unitId) {
    return null;
  }

  return <AssetDetailScreen unitId={unitId} />;
}