// app/work-orders/[id]/focused-job/_components/FocusedJobSplitView.tsx
// Desktop/tablet: side-by-side view where the left side is the WO page (existing),
// and the right side is a "focused job panel" mounted in-page (NOT a modal).
//
// NOTE:
// - This file intentionally does NOT duplicate business logic.
// - It simply composes existing pages/components in a split layout.
// - The actual "panel" is a lightweight client wrapper around FocusedJobModal UI,
//   rendered as an in-page panel instead of a Dialog.

import type { ReactNode } from "react";

export default function FocusedJobSplitView(props: {
  left: ReactNode;
  right: ReactNode;
}): JSX.Element {
  return (
    <div className="w-full bg-background text-foreground">
      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7 xl:col-span-8">{props.left}</div>
          <div className="lg:col-span-5 xl:col-span-4">{props.right}</div>
        </div>
      </div>
    </div>
  );
}
