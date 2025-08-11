import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: { params: { slug: string } }): Promise<Metadata> {
  return {
    title: `Booking QR — ${params.slug} | ProFixIQ`,
  };
}