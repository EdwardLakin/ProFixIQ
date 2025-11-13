// @ts-nocheck
import type { Metadata } from "next";
import PublicProfileClient from "./ShopPublicProfileView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Simple, concrete params type – matches this route: /portal/shop/[slug]
type RouteParams = { slug: string };

export async function generateMetadata(
  { params }: { params: RouteParams }
): Promise<Metadata> {
  return {
    title: `Shop • ${params.slug} | ProFixIQ`,
  };
}

export default function Page({ params }: { params: RouteParams }) {
  return <PublicProfileClient slug={params.slug} />;
}