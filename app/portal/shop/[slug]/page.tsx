// app/portal/shop/[slug]/page.tsx
import type { Metadata } from "next";
import PublicProfileClient from "./ShopPublicProfileView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Make params compatible with Next's internal `Params` type
type ShopPageParams = Record<string, string> & {
  slug: string;
};

type ShopPageProps = {
  params: ShopPageParams;
};

// Optional: dynamic-ish title; safe typing-wise now
export async function generateMetadata(
  { params }: ShopPageProps
): Promise<Metadata> {
  return {
    title: `Shop • ${params.slug} | ProFixIQ`,
  };
}

export default function Page({ params }: ShopPageProps) {
  return <PublicProfileClient slug={params.slug} />;
}