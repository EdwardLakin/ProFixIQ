"use client";

import { CheckCircle2, Lock } from "lucide-react";
import { cn } from "@shared/lib/utils";

type BaseProps = {
  title: string;
  className?: string;
  available?: boolean; // optional now
};

/** Support either:
 *  - { title, description, available? }
 *  - { title, subtitle?, content, available? }
 */
type WithDescription = BaseProps & { description: string; content?: never; subtitle?: never };
type WithContent = BaseProps & { content: string; subtitle?: string; description?: never };

type FeatureCardProps = WithDescription | WithContent;

export default function FeatureCard(props: FeatureCardProps) {
  const { title, className, available } = props;

  const hasSubtitle = "subtitle" in props && props.subtitle;
  const bodyText = "content" in props ? props.content : props.description;

  const palette =
    available === undefined
      ? // Neutral style when availability isn’t specified
        "border-neutral-700 bg-neutral-900/40 hover:shadow-black/30"
      : available
      ? "border-green-600/60 bg-green-900/10 hover:shadow-green-600/30"
      : "border-red-600/60 bg-red-900/10 hover:shadow-red-600/30";

  const Icon = available === undefined ? null : available ? CheckCircle2 : Lock;
  const iconColor =
    available === undefined ? "text-orange-400" : available ? "text-green-400" : "text-red-400";

  return (
    <div
      className={cn(
        "rounded-xl p-5 backdrop-blur-md border transition-all duration-200 shadow-md",
        "flex flex-col gap-2 items-start text-left",
        "hover:-translate-y-[1px]",
        palette,
        className,
      )}
      role="article"
      aria-label={title}
    >
      <div className="flex items-center gap-2">
        {Icon ? <Icon className={cn("w-5 h-5", iconColor)} aria-hidden /> : null}
        <h3 className="text-lg font-blackops text-white">{title}</h3>
      </div>

      {hasSubtitle ? (
        <p className="text-xs text-orange-300/80 font-blackops -mt-1">{(props as any).subtitle}</p>
      ) : null}

      <p className="text-sm text-neutral-300 leading-snug">
        {bodyText}
      </p>
    </div>
  );
}