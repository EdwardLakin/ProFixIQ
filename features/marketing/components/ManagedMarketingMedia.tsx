/* eslint-disable @next/next/no-img-element */
"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getPublishedMarketingSlots } from "@/features/marketing/components/publicMarketingMedia";
import {
  getMarketingPageKeyForHref,
  type MarketingMediaAsset,
  type MarketingPageKey,
} from "@/features/marketing/media/types";

export default function ManagedMarketingMedia({
  slotKey,
  pageKey,
  fallback = null,
  mediaClassName = "h-full w-full object-contain object-top",
  captionClassName,
  autoPlayVideo = false,
}: {
  slotKey: string;
  pageKey?: MarketingPageKey;
  fallback?: ReactNode;
  mediaClassName?: string;
  captionClassName?: string;
  autoPlayVideo?: boolean;
}) {
  const pathname = usePathname();
  const resolvedPageKey = useMemo(
    () => pageKey ?? getMarketingPageKeyForHref(pathname),
    [pageKey, pathname],
  );
  const [asset, setAsset] = useState<MarketingMediaAsset | null>(null);

  useEffect(() => {
    let active = true;
    setAsset(null);
    if (!resolvedPageKey) return () => { active = false; };

    void getPublishedMarketingSlots(resolvedPageKey).then((slots) => {
      if (active) setAsset(slots[slotKey] ?? null);
    });

    return () => {
      active = false;
    };
  }, [resolvedPageKey, slotKey]);

  if (!asset) return <>{fallback}</>;

  const resolvedCaptionClassName =
    captionClassName ??
    (resolvedPageKey === "home"
      ? "px-1 pt-3 text-xs leading-5 text-slate-600"
      : "border-t border-white/10 px-5 py-4 text-xs leading-5 text-slate-400");

  return (
    <div>
      <div className="aspect-[16/10] w-full overflow-hidden bg-[#07111f]">
        {asset.kind === "video" ? (
          <video
            src={asset.url}
            aria-label={asset.alt}
            className={mediaClassName}
            muted
            autoPlay={autoPlayVideo}
            loop={autoPlayVideo}
            playsInline
            controls
            preload="metadata"
          />
        ) : (
          <img src={asset.url} alt={asset.alt} className={mediaClassName} />
        )}
      </div>
      {asset.caption ? <p className={resolvedCaptionClassName}>{asset.caption}</p> : null}
    </div>
  );
}
