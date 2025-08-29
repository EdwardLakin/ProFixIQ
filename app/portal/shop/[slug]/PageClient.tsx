// app/portal/shop/[slug]/PageClient.tsx
"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ShareBox from "./ShareBox";
import ReviewsList from "@shared/components/reviews/ReviewsList";
import ReviewForm from "@shared/components/reviews/ReviewForm";

/** Build a base URL that works in all environments */
function getBaseUrl(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL!;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://example.com";
}

type Props = {
  slug: string;
  /** Pass from server if you already looked it up; otherwise we’ll fetch by slug. */
  shopId?: string;
};

export default function ShopSharePage({ slug, shopId: shopIdProp }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [shopId, setShopId] = useState<string>(shopIdProp ?? "");

  useEffect(() => {
    if (shopIdProp) return; // already provided by server
    (async () => {
      const { data } = await supabase
        .from("shops")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (data?.id) setShopId(data.id);
    })();
  }, [slug, shopIdProp, supabase]);

  const base = getBaseUrl();
  const bookingUrl = `${base}/portal/booking?shop=${encodeURIComponent(slug)}`;
  const qrSrc = `/api/portal/qr?shop=${encodeURIComponent(slug)}`;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-blackops text-orange-400">
          Share your booking link
        </h1>
        <ShareBox slug={slug} bookingUrl={bookingUrl} qrSrc={qrSrc} />
      </div>

      {/* Reviews */}
      {shopId ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Reviews</h2>
          <ReviewsList shopId={shopId} />
          <ReviewForm shopId={shopId} />
        </section>
      ) : null}
    </div>
  );
}