import Link from "next/link";
import { loadShadowPreviewContext } from "@/features/integrations/shopBoost/shadowShop";
import { verifyShopBoostShareToken } from "@/features/integrations/shopBoost/shareAccess";
import ShadowPreviewClient from "./_components/ShadowPreviewClient";

type PageProps = {
  params: Promise<{ demoId: string }>;
  searchParams: Promise<{ intakeId?: string; mode?: string; share?: string; token?: string }>;
};

export default async function DemoPreviewPage({ params, searchParams }: PageProps) {
  const { demoId } = await params;
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const shared = sp.share === "1";
  const validatedToken = token ? verifyShopBoostShareToken(token) : null;
  const intakeId = typeof sp.intakeId === "string" ? sp.intakeId : validatedToken?.intakeId ?? "";
  const mode = sp.mode === "sales" ? "sales" : "default";
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
  if (!isUuid(demoId) || !isUuid(intakeId)) {
    return (
      <div className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
          <p className="text-lg font-semibold">Preview expired</p>
          <p className="mt-2 text-sm text-neutral-400">This preview link is invalid or expired. Start a new analysis to continue.</p>
          <Link href="/demo/instant-shop-analysis" className="mt-4 inline-flex rounded-md border border-white/20 px-3 py-1.5 text-xs">Restart analysis</Link>
        </div>
      </div>
    );
  }

  const context = await loadShadowPreviewContext({ demoId, intakeId });
  if (!context) {
    return (
      <div className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
          <p className="text-lg font-semibold">Preview expired</p>
          <p className="mt-2 text-sm text-neutral-400">The demo snapshot is missing or no longer matches this intake link. Please restart Instant Shop Analysis.</p>
          <Link href="/demo/instant-shop-analysis" className="mt-4 inline-flex rounded-md border border-white/20 px-3 py-1.5 text-xs">Restart analysis</Link>
        </div>
      </div>
    );
  }

  if (shared && token && (!validatedToken || validatedToken.demoId !== demoId || validatedToken.intakeId !== intakeId)) {
    return (
      <div className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
          <p className="text-lg font-semibold">Share link expired</p>
          <p className="mt-2 text-sm text-neutral-400">This shared link is no longer valid. Ask the sender for a fresh link.</p>
        </div>
      </div>
    );
  }

  return (
    <ShadowPreviewClient
      context={context}
      mode={mode}
      shareMeta={
        shared
          ? {
              enabled: true,
              senderName: validatedToken?.senderName ?? null,
              token: token || null,
            }
          : { enabled: false, senderName: null, token: null }
      }
    />
  );
}
