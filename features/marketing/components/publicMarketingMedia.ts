import type {
  MarketingMediaAsset,
  MarketingPageKey,
} from "@/features/marketing/media/types";

type PublicPayload = {
  slots?: Record<string, MarketingMediaAsset>;
};

const pageSlotsCache = new Map<
  MarketingPageKey,
  Promise<Record<string, MarketingMediaAsset>>
>();

export function getPublishedMarketingSlots(
  pageKey: MarketingPageKey,
): Promise<Record<string, MarketingMediaAsset>> {
  const cached = pageSlotsCache.get(pageKey);
  if (cached) return cached;

  const request = fetch(`/api/public/marketing/pages/${pageKey}`)
    .then(async (response) => {
      if (!response.ok) return {};
      const payload = (await response.json()) as PublicPayload;
      return payload.slots ?? {};
    })
    .catch(() => ({}));

  pageSlotsCache.set(pageKey, request);
  return request;
}
