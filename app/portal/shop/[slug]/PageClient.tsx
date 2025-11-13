// app/portal/shop/[slug]/PageClient.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ShareBox from "./ShareBox";
import ReviewsList from "@shared/components/reviews/ReviewsList";
import ReviewForm from "@shared/components/reviews/ReviewForm";

type Props = {
  slug: string;
  /** Pass from server if you already looked it up; otherwise we’ll fetch by slug. */
  shopId?: string;
};

export default function ShopSharePage({ slug, shopId: shopIdProp }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [shopId, setShopId] = useState<string>(shopIdProp ?? "");
  const [loadingShopId, setLoadingShopId] = useState(!shopIdProp);

  useEffect(() => {
    if (shopIdProp) return; // already provided by server
    (async () => {
      setLoadingShopId(true);
      const { data } = await supabase
        .from("shops")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (data?.id) setShopId(data.id);
      setLoadingShopId(false);
    })();
  }, [slug, shopIdProp, supabase]);

  /** Build a base URL that works in all environments */
  const base =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_URL
      ? process.env.NEXT_PUBLIC_BASE_URL
      : typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://example.com";

  const bookingUrl = `${base}/portal/booking?shop=${encodeURIComponent(slug)}`;
  const qrSrc = `/api/portal/qr?shop=${encodeURIComponent(slug)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-blackops text-orange-400">
          Share your booking link
        </h1>
        <p className="text-sm text-neutral-400">
          Copy your booking link, download a QR code, and manage reviews for this
          shop.
        </p>
      </header>

      <ShareBox slug={slug} bookingUrl={bookingUrl} qrSrc={qrSrc} />

      {/* Reviews */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-50">
            Customer reviews
          </h2>
          {loadingShopId && (
            <span className="text-xs text-neutral-500">Loading shop…</span>
          )}
        </div>

        {shopId ? (
          <>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-4">
              <ReviewsList shopId={shopId} />
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-4">
              <ReviewForm shopId={shopId} />
            </div>
          </>
        ) : !loadingShopId ? (
          <div className="rounded-xl border border-red-700/40 bg-red-900/30 p-3 text-sm text-red-100">
            We couldn’t resolve this shop. Check that the share link uses a valid
            slug.
          </div>
        ) : null}
      </section>
    </div>
  );
}