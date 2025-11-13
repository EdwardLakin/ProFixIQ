// app/portal/shop/[slug]/page.tsx
import type { Metadata } from "next";
import PublicProfileClient from "./ShopPublicProfileView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Local props type for the page component
type PageProps = {
  params: { slug: string };
};

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const { slug } = params;

  return {
    title: `Shop • ${slug} | ProFixIQ`,
  };
}

export default function Page({ params }: PageProps) {
  const { slug } = params;
  return <PublicProfileClient slug={slug} />;
}