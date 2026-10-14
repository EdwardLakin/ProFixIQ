/* eslint-disable @next/next/no-img-element */
"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getMarketingPageKeyForHref,
  type MarketingMediaAsset,
  type MarketingPageKey,
} from "@/features/marketing/media/types";

type PublicPayload = {
  slots?: Record<string, MarketingMediaAsset>;
};

const pageRequests = new Map<string, Promise<Record<string, MarketingMediaAsset>>>();

function loadPublishedSlots(pageKey: MarketingPageKey) {
  const existing = pageRequests.get(pageKey);
  if (existing) return existing;

  const request = fetch(`/api/public/marketing/pages/${pageKey}`)
    .then(async (response) => {
      if (!response.ok) return {};
      const payload = (await response.json()) as PublicPayload;
      return payload.slots ?? {};
    })
    .catch(() => ({}));

  pageRequests.set(pageKey, request);
  return request;
}

export default function ManagedMarketingMedia({
  slotKey,
  pageKey,
  fallback = null,
  mediaClassName = "h-auto w-full object-contain object-top",
  captionClassName = "border-t border-white/10 px-5 py-4 text-xs leading-5 text-slate-400",
  autoPlayVideo = true,
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

    void loadPublishedSlots(resolvedPageKey).then((slots) => {
      if (active) setAsset(slots[slotKey] ?? null);
    });

    return () => {
      active = false;
    };
  }, [resolvedPageKey, slotKey]);

  if (!asset) return <>{fallback}</>;

  return (
    <>
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
      {asset.caption ? (
        <p className={captionClassName}>{asset.caption}</p>
      ) : null}
    </>
  );
}
