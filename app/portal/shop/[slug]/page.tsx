// app/portal/shop/[slug]/page.tsx
import type { Metadata } from "next";
import PublicProfileClient from "./ShopPublicProfileView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Static metadata avoids the ParsedUrlQueryInput generic weirdness on Vercel
export const metadata: Metadata = {
  title: "Shop | ProFixIQ",
};

type ShopPageProps = {
  params: { slug: string };
};

export default function Page({ params }: ShopPageProps) {
  return <PublicProfileClient slug={params.slug} />;
}