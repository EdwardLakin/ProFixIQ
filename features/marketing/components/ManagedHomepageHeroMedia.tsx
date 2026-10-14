/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import type { MarketingMediaAsset } from "@/features/marketing/media/types";

export default function ManagedHomepageHeroMedia() {
  const [asset, setAsset] = useState<MarketingMediaAsset | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/public/marketing/pages/home", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as {
          slots?: Record<string, MarketingMediaAsset>;
        };
        return payload.slots?.hero ?? null;
      })
      .then((nextAsset) => {
        if (active && nextAsset) setAsset(nextAsset);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  if (!asset) return null;

  return (
    <div className="absolute inset-0 z-10 overflow-hidden rounded-[1.75rem] border border-[color:var(--marketing-border-strong)] bg-[#07111f] shadow-[0_32px_80px_rgba(7,17,31,0.14)]">
      {asset.kind === "video" ? (
        <video
          src={asset.url}
          aria-label={asset.alt}
          className="h-full w-full object-cover object-top"
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={asset.url}
          alt={asset.alt}
          className="h-full w-full object-cover object-top"
        />
      )}
      {asset.caption ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-12 text-xs leading-5 text-white/85">
          {asset.caption}
        </div>
      ) : null}
    </div>
  );
}
