// app/portal/shop/[slug]/page.tsx
import type { Metadata } from "next";
import PublicProfileClient from "./ShopPublicProfileView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Match Next's Params shape: string | string[]
type ShopPageParams = {
  [key: string]: string | string[];
  slug: string | string[];
};

function getSlug(params: ShopPageParams): string {
  const raw = params.slug;
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function generateMetadata(
  props: { params: ShopPageParams }
): Promise<Metadata> {
  const slug = getSlug(props.params);

  return {
    title: `Shop • ${slug} | ProFixIQ`,
  };
}

export default function Page(props: { params: ShopPageParams }) {
  const slug = getSlug(props.params);
  return <PublicProfileClient slug={slug} />;
}