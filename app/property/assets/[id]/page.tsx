import PropertyAssetDetailDemo from "@/features/property/components/PropertyAssetDetailDemo";
import { getPropertyAssetDetailData } from "@/features/property/server/propertyOperationsQueries";

interface PropertyAssetPageProps {
  params: Promise<{ id: string }>;
}

export default async function PropertyAssetPage({
  params,
}: PropertyAssetPageProps) {
  const { id } = await params;
  const assetDetailData = await getPropertyAssetDetailData(id);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <PropertyAssetDetailDemo assetId={id} liveData={assetDetailData} />
      </div>
    </main>
  );
}
