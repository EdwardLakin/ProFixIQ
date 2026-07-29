"use client";

import EvidenceOverlay from "./EvidenceOverlay";
import type { WorkOrderEvidenceItem } from "@/features/work-orders/lib/evidence/workOrderEvidence";

export default function EvidenceImage({
  item,
  showMarkup = true,
  alt,
  className = "",
}: {
  item: WorkOrderEvidenceItem;
  showMarkup?: boolean;
  alt: string;
  className?: string;
}) {
  if (!item.displayUrl) {
    return (
      <div className={`grid min-h-32 place-items-center text-xs text-[color:var(--theme-text-muted)] ${className}`}>
        Preview unavailable
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Dynamic signed storage URLs retain their native aspect ratio here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.displayUrl} alt={alt} className="block h-auto w-full" />
      {showMarkup && item.annotation ? (
        <EvidenceOverlay elements={item.annotation.overlay} />
      ) : null}
    </div>
  );
}

