// app/portal/shop/[slug]/PageClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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

const COPPER = "var(--pfq-copper)";

function SignalDot() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{
        background: "rgba(197,122,74,0.95)",
        boxShadow: "0 0 18px rgba(197,122,74,0.55)",
      }}
      aria-hidden
    />
  );
}

export default function ShopSharePage({ slug, shopId: shopIdProp }: Props) {
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    [],
  );

  const [shopId, setShopId] = useState<string>(shopIdProp ?? "");
  const [loadingShopId, setLoadingShopId] = useState(!shopIdProp);

  useEffect(() => {
    if (shopIdProp) return; // already provided by server
    let alive = true;

    void (async () => {
      setLoadingShopId(true);
      const { data } = await supabase
        .from("shops")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (!alive) return;

      if (data?.id) setShopId(data.id);
      setLoadingShopId(false);
    })();

    return () => {
      alive = false;
    };
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

  const Card =
    "rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card sm:p-6";

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <header className="space-y-2">
        <div
          className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400"
        >
          <SignalDot />
          Shop tools
        </div>

        <h1
          className="text-2xl font-blackops"
          style={{ color: COPPER }}
        >
          Share your booking link
        </h1>

        <p className="text-sm text-neutral-400">
          Copy your booking link, download a QR code, and manage reviews for this shop.
        </p>
      </header>

      <div className={Card}>
        <ShareBox slug={slug} bookingUrl={bookingUrl} qrSrc={qrSrc} />
      </div>

      {/* Reviews */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SignalDot />
            <h2 className="text-lg font-semibold text-neutral-50">
              Customer reviews
            </h2>
          </div>

          {loadingShopId && (
            <span className="text-xs text-neutral-500">Loading shop…</span>
          )}
        </div>

        {shopId ? (
          <>
            <div className={Card}>
              <ReviewsList shopId={shopId} />
            </div>
            <div className={Card}>
              <ReviewForm shopId={shopId} />
            </div>
          </>
        ) : !loadingShopId ? (
          <div className="rounded-3xl border border-red-500/30 bg-red-950/25 p-4 text-sm text-red-100 backdrop-blur">
            We couldn’t resolve this shop. Check that the share link uses a valid slug.
          </div>
        ) : null}
      </section>
    </div>
  );
}