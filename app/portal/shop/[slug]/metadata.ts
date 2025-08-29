// app/portal/shop/[slug]/metadata.ts
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Booking QR — ${slug} | ProFixIQ` };
}