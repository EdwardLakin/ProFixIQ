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

export default function ManagedMarketingMedia({
  slotKey,
  pageKey,
  fallback = null,
  mediaClassName = "h-full w-full object-contain object-top",
  captionClassName = "border-t border-white/10 px-5 py-4 text-xs leading-5 text-slate-400",
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

    void fetch(`/api/public/marketing/pages/${resolvedPageKey}`)
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as PublicPayload;
        return payload.slots?.[slotKey] ?? null;
      })
      .then((nextAsset) => {
        if (active) setAsset(nextAsset);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [resolvedPageKey, slotKey]);

  if (!asset) return <>{fallback}</>;

  return (
    <>
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
      {asset.caption ? <p className={captionClassName}>{asset.caption}</p> : null}
    </>
  );
}
