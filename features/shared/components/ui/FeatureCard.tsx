// shared/components/ui/FeatureCard.tsx
"use client";

import { CheckCircle2, Lock } from "lucide-react";
import { cn } from "@shared/lib/utils";

type BaseProps = {
  title: string;
  className?: string;
  available?: boolean; // optional now
};

type WithDescription = BaseProps & {
  description: string;
  content?: never;
  subtitle?: never;
};
type WithContent = BaseProps & {
  content: string;
  subtitle?: string;
  description?: never;
};

type FeatureCardProps = WithDescription | WithContent;

export default function FeatureCard(props: FeatureCardProps) {
  const { title, className, available } = props;

  const hasSubtitle = "subtitle" in props && props.subtitle;
  const bodyText = "content" in props ? props.content : props.description;

  const palette =
    available === undefined
      ? "border-white/10 bg-black/30 hover:border-accent/70 hover:shadow-glow"
      : available
      ? "border-emerald-500/70 bg-emerald-900/20 hover:shadow-[0_0_12px_rgba(16,185,129,0.6)]"
      : "border-red-500/70 bg-red-900/20 hover:shadow-[0_0_12px_rgba(248,113,113,0.6)]";

  const Icon =
    available === undefined ? null : available ? CheckCircle2 : Lock;
  const iconColor =
    available === undefined
      ? "text-accent"
      : available
      ? "text-emerald-400"
      : "text-red-400";

  return (
    <article
      className={cn(
        "rounded-2xl p-5 backdrop-blur-md border shadow-card",
        "flex flex-col gap-2 items-start text-left",
        "transition-transform duration-150 hover:-translate-y-[1px]",
        palette,
        className,
      )}
      aria-label={title}
    >
      <div className="flex items-center gap-2">
        {Icon ? <Icon className={cn("w-5 h-5", iconColor)} aria-hidden /> : null}
        <h3 className="text-lg font-blackops text-white">{title}</h3>
      </div>

      {hasSubtitle ? (
        <p className="text-[11px] uppercase tracking-wide text-orange-300/80 -mt-1">
          {(props as any).subtitle}
        </p>
      ) : null}

      <p className="text-sm text-neutral-300 leading-snug">{bodyText}</p>
    </article>
  );
}