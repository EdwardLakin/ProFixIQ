import type { ActivationReadiness } from "@/features/integrations/shopBoost/activationContext";

type ActivationCTAArgs = {
  readiness: ActivationReadiness;
  blockers: string[];
  confidence: number;
};

export type ActivationCTA = {
  label: string;
  subtext: string;
  urgencyTone: "low" | "medium" | "high";
};

export function getActivationCTA(args: ActivationCTAArgs): ActivationCTA {
  if (args.readiness === "READY") {
    return {
      label: "Activate your shop",
      subtext: `Start free trial and import now (${args.confidence}% confidence).`,
      urgencyTone: "low",
    };
  }

  if (args.readiness === "REVIEW_REQUIRED") {
    return {
      label: "Activate and review flagged items",
      subtext: `Start setup with guided fixes. ${args.blockers.length} items are flagged for review.`,
      urgencyTone: "medium",
    };
  }

  return {
    label: "Fix blockers and activate",
    subtext: `Resolve issues to continue. ${args.blockers.length} blocker${args.blockers.length === 1 ? "" : "s"} detected.`,
    urgencyTone: "high",
  };
}
