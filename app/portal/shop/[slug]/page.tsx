// app/portal/shop/[slug]/page.tsx
import type { Metadata } from "next";
import PublicProfileClient from "./ShopPublicProfileView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  return {
    title: `Shop • ${params.slug} | ProFixIQ`,
  };
}

export default function Page({ params }: { params: { slug: string } }) {
  return <PublicProfileClient slug={params.slug} />;
}