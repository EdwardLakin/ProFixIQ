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
    <main className="min-h-screen bg-[var(--theme-gradient-panel)] px-4 py-6 text-[color:var(--theme-text-primary)] md:px-8">
      <div className="mx-auto max-w-6xl">
        <PropertyAssetDetailDemo assetId={id} liveData={assetDetailData} />
      </div>
    </main>
  );
}
