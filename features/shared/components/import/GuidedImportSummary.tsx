import type { ReactNode } from "react";

type Tone = "success" | "error" | "warning";

const toneClassName: Record<Tone, string> = {
  success: "border-emerald-500/25 bg-emerald-950/25 text-emerald-50",
  error: "border-red-500/25 bg-red-950/30 text-red-100",
  warning: "border-amber-500/25 bg-amber-950/20 text-amber-50",
};

export function GuidedImportSummary({
  tone,
  children,
  className = "",
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mt-4 rounded-xl border p-3 text-sm ${toneClassName[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
