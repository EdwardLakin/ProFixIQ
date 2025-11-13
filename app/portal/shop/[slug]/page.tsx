// app/portal/shop/[slug]/page.tsx
import type { Metadata } from "next";
import PublicProfileClient from "./ShopPublicProfileView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(
  props: PageProps
): Promise<Metadata> {
  const { slug } = await props.params;
  return {
    title: `Shop • ${slug} | ProFixIQ`,
  };
}

export default async function Page(props: PageProps) {
  const { slug } = await props.params;
  return <PublicProfileClient slug={slug} />;
}