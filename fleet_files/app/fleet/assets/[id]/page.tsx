// app/fleet/assets/[id]/page.tsx

export const dynamic = "force-dynamic";
export const revalidate = 0;

import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";

type PageProps = {
  params: { id: string };
};

export default function Page({ params }: PageProps) {
  return <AssetDetailScreen unitId={params.id} />;
}