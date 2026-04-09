import { buildOperationalStoryCandidatesForShop } from "./buildOperationalStoryCandidates";
import { mapOperationalStoryCandidateToStoryEvent } from "./mapOperationalStoryCandidateToStoryEvent";
import { postStoryEventToShopReel } from "./postStoryEventToShopReel";

function isOperationalStoryBridgeEnabled(): boolean {
  const value = process.env.SHOPREEL_ENABLE_OPERATIONAL_STORY_BRIDGE;
  return value === "1" || value === "true";
}

export async function postOperationalStoryCandidatesToShopReel(args: {
  shopId: string;
  maxCandidates?: number;
}) {
  if (!isOperationalStoryBridgeEnabled()) {
    return {
      skipped: true,
      reason: "Operational story bridge is disabled.",
      delivered: 0,
      attempted: 0,
      candidates: 0,
    };
  }

  const candidates = await buildOperationalStoryCandidatesForShop(args.shopId);
  const selected = candidates.slice(0, Math.max(1, Math.min(args.maxCandidates ?? 2, 5)));

  if (selected.length === 0) {
    return {
      skipped: true,
      reason: "No operational story candidates available.",
      delivered: 0,
      attempted: 0,
      candidates: 0,
    };
  }

  const results = await Promise.all(
    selected.map(async (candidate) => {
      const event = mapOperationalStoryCandidateToStoryEvent(candidate);
      const result = await postStoryEventToShopReel(event);
      return {
        candidateId: candidate.candidateId,
        candidateType: candidate.candidateType,
        result,
      };
    }),
  );

  const delivered = results.filter((item) => item.result.ok && !item.result.skipped).length;

  return {
    skipped: false,
    delivered,
    attempted: results.length,
    candidates: candidates.length,
    results,
  };
}
