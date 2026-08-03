import type { SVGProps } from "react";
import { cn } from "@shared/lib/utils";

export function ProFixIQMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 96 96"
      role="img"
      aria-label="ProFixIQ"
      className={cn("shrink-0", className)}
      {...props}
    >
      <defs>
        <linearGradient id="profixiq-mark-gradient" x1="12" y1="82" x2="82" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1747FF" />
          <stop offset="1" stopColor="#0BB7FF" />
        </linearGradient>
      </defs>
      <path
        d="M18 78V43C18 25.327 32.327 11 50 11h15c11.598 0 21 9.402 21 21S76.598 53 65 53H43"
        fill="none"
        stroke="url(#profixiq-mark-gradient)"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M43 78V60c0-8.284 6.716-15 15-15h7"
        fill="none"
        stroke="url(#profixiq-mark-gradient)"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProFixIQWordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center font-semibold tracking-[-0.045em]", className)}>
      <span className="text-current">ProFix</span>
      <span className="bg-gradient-to-r from-[#1747FF] to-[#0BB7FF] bg-clip-text text-transparent">IQ</span>
      {!compact ? null : <span className="sr-only"> ProFixIQ</span>}
    </span>
  );
}
