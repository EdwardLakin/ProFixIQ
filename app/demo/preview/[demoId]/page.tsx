import Link from "next/link";
import { loadShadowPreviewContext } from "@/features/integrations/shopBoost/shadowShop";
import ShadowPreviewClient from "./_components/ShadowPreviewClient";

type PageProps = {
  params: Promise<{ demoId: string }>;
  searchParams: Promise<{ intakeId?: string }>;
};

export default async function DemoPreviewPage({ params, searchParams }: PageProps) {
  const { demoId } = await params;
  const sp = await searchParams;
  const intakeId = typeof sp.intakeId === "string" ? sp.intakeId : "";

  if (!intakeId) {
    return (
      <div className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
          <p className="text-lg font-semibold">Missing preview intake</p>
          <p className="mt-2 text-sm text-neutral-400">This preview link is incomplete. Return to Instant Shop Analysis and relaunch preview mode.</p>
          <Link href="/demo/instant-shop-analysis" className="mt-4 inline-flex rounded-md border border-white/20 px-3 py-1.5 text-xs">Back to analysis</Link>
        </div>
      </div>
    );
  }

  const context = await loadShadowPreviewContext({ demoId, intakeId });
  if (!context) {
    return (
      <div className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
          <p className="text-lg font-semibold">Preview not available</p>
          <p className="mt-2 text-sm text-neutral-400">We couldn&apos;t validate this demo scope. Please run Instant Shop Analysis again to generate a fresh preview.</p>
          <Link href="/demo/instant-shop-analysis" className="mt-4 inline-flex rounded-md border border-white/20 px-3 py-1.5 text-xs">Run analysis again</Link>
        </div>
      </div>
    );
  }

  return <ShadowPreviewClient context={context} />;
}
