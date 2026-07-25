import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadShadowPreviewContext } from "@/features/integrations/shopBoost/shadowShop";
import { verifyShopBoostPreviewToken } from "@/features/integrations/shopBoost/shareAccess";
import ShadowPreviewClient from "./_components/ShadowPreviewClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = {
  params: Promise<{ demoId: string }>;
  searchParams: Promise<{ mode?: string; share?: string; token?: string }>;
};

export default async function DemoPreviewPage({ params, searchParams }: PageProps) {
  noStore();

  const [{ demoId: routeDemoId }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.token === "string" ? sp.token : "";
  const access = token ? verifyShopBoostPreviewToken(token) : null;

  if (!access || access.demoId !== routeDemoId) notFound();

  const context = await loadShadowPreviewContext({
    demoId: access.demoId,
    intakeId: access.intakeId,
  });
  if (!context) notFound();

  const shared = sp.share === "1";
  const mode = sp.mode === "sales" ? "sales" : "default";

  return (
    <ShadowPreviewClient
      context={context}
      mode={mode}
      shareMeta={{
        enabled: shared,
        senderName: shared ? access.senderName ?? null : null,
        token,
      }}
    />
  );
}
