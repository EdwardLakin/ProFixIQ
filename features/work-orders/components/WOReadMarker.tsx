// features/work-orders/components/WOReadMarker.tsx
"use client";

import { useFeatureRead } from "@shared/hooks/useFeatureRead";

export default function WOReadMarker() {
  useFeatureRead("work-orders");
  return null;
}