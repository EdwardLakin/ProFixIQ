import type { Metadata } from "next";
import ShareBox from "./ShareBox";

export const metadata: Metadata = {
  title: "Share your booking link",
};

export default async function ShopSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Build the public booking URL shown to staff
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const bookingUrl = `${base}/portal/booking?shop=${encodeURIComponent(slug)}`;

  // QR endpoint you already created
  const qrSrc = `/api/portal/qr/${encodeURIComponent(slug)}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-blackops text-orange-400">
        Share your booking link
      </h1>

      <ShareBox slug={slug} bookingUrl={bookingUrl} qrSrc={qrSrc} />
    </div>
  );
}