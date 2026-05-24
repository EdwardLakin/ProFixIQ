"use client";

import { useRouter } from "next/navigation";
import { AlertCircleIcon, LockIcon, WrenchIcon } from "lucide-react";
import clsx from "clsx";

type LockedFeatureReason =
  | "setup_required"
  | "permission_required"
  | "usage_limit"
  | "temporary_unavailable";

interface LockedFeatureProps {
  /**
   * Neutral access state for setup, permission, usage, or temporary availability.
   * This component is no longer a pricing/feature-gate paywall.
   */
  reason?: LockedFeatureReason;
  /**
   * Optional CTA for setup-only flows.
   * Maintained as explicit opt-in to avoid module/plan purchase messaging.
   */
  showSetupButton?: boolean;
  setupHref?: string;
  className?: string;

  /**
   * Backward-compatibility props from legacy feature tax UX.
   * Intentionally ignored for rendering paywall copy/routes.
   */
  showUpgradeButton?: boolean;
  showTryNowButton?: boolean;
  featureId?: string;
  plan?: string;
  addOnAvailable?: boolean;
}

const REASON_COPY: Record<
  LockedFeatureReason,
  { title: string; body: string; icon: typeof LockIcon }
> = {
  setup_required: {
    title: "Setup required",
    body: "This workflow needs a setup step before it can run.",
    icon: WrenchIcon,
  },
  permission_required: {
    title: "Permission required",
    body: "Your role does not include this action. Ask an owner or admin for access.",
    icon: LockIcon,
  },
  usage_limit: {
    title: "Usage limit reached",
    body: "You’ve reached your current shop-size or usage limit. Contact support if your operation has grown.",
    icon: AlertCircleIcon,
  },
  temporary_unavailable: {
    title: "Temporarily unavailable",
    body: "This workflow is temporarily unavailable. Try again shortly.",
    icon: AlertCircleIcon,
  },
};

export default function LockedFeature({
  reason = "permission_required",
  showSetupButton = false,
  setupHref = "/settings",
  className,
}: LockedFeatureProps) {
  const router = useRouter();
  const copy = REASON_COPY[reason];
  const Icon = copy.icon;

  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(184,115,51,0.10),rgba(0,0,0,0.82))] p-6",
        "text-center shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl",
        "flex flex-col items-center gap-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[color:var(--accent-copper-light,#fdba74)]">
        <Icon className="h-5 w-5" />
        <span className="text-lg font-semibold">{copy.title}</span>
      </div>

      <p className="max-w-md text-sm text-neutral-300">{copy.body}</p>

      {showSetupButton && reason === "setup_required" ? (
        <div className="mt-1 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => router.push(setupHref)}
            className="rounded-full border border-[rgba(184,115,51,0.45)] bg-[rgba(184,115,51,0.10)] px-5 py-2 text-sm font-semibold text-amber-100 transition hover:bg-[rgba(184,115,51,0.16)]"
          >
            Review setup
          </button>
        </div>
      ) : null}
    </div>
  );
}
