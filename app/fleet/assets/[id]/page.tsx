// app/fleet/assets/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";

interface FleetAssetPageProps {
  // Vercel's generated PageProps wants `params` to be a Promise-like type.
  params: Promise<{ id: string }>;
}

export default async function FleetAssetPage({ params }: FleetAssetPageProps) {
  const { id } = await params;

  return <AssetDetailScreen unitId={id} />;
}