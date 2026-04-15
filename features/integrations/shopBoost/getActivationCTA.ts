import type { ActivationReadiness } from "@/features/integrations/shopBoost/activationContext";
import { buildActivationCTAState } from "@/features/integrations/shopBoost/conversionPolish";

type ActivationCTAArgs = {
  readiness: ActivationReadiness;
  blockers: string[];
  confidence: number;
  monthlyImpact?: number;
  reviewQueue?: number;
};

export type ActivationCTA = {
  label: string;
  subtext: string;
  helper: string;
  urgencyTone: "low" | "medium" | "high";
};

export function getActivationCTA(args: ActivationCTAArgs): ActivationCTA {
  return buildActivationCTAState({
    readiness: args.readiness,
    monthlyImpact: args.monthlyImpact ?? 0,
    blockers: args.blockers.length,
    reviewQueue: args.reviewQueue ?? args.blockers.length,
    confidence: args.confidence,
  });
}
