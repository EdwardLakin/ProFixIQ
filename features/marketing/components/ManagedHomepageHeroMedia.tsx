/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { getPublishedMarketingSlots } from "@/features/marketing/components/publicMarketingMedia";
import type { MarketingMediaAsset } from "@/features/marketing/media/types";

export default function ManagedHomepageHeroMedia() {
  const [asset, setAsset] = useState<MarketingMediaAsset | null>(null);

  useEffect(() => {
    let active = true;
    void getPublishedMarketingSlots("home").then((slots) => {
      if (active) setAsset(slots.hero ?? null);
    });

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
          className="h-full w-full object-contain object-top"
          muted
          autoPlay
          loop
          playsInline
          controls
          preload="metadata"
        />
      ) : (
        <img
          src={asset.url}
          alt={asset.alt}
          className="h-full w-full object-contain object-top"
        />
      )}
      {asset.caption ? (
        <div className="pointer-events-none absolute left-4 top-4 max-w-[75%] rounded-lg bg-black/70 px-3 py-2 text-xs leading-5 text-white/90">
          {asset.caption}
        </div>
      ) : null}
    </div>
  );
}
