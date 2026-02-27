// app/work-orders/[id]/focused-job/_components/FocusedJobSplitView.tsx
// Desktop/tablet: side-by-side view where the left side is the WO page (existing),
// and the right side is a "focused job panel" mounted in-page (NOT a modal).
//
// Key layout rules:
// - On lg+: right panel is sticky and scrollable within the viewport.
// - min-h-0 is critical so children can scroll inside CSS grid/flex.
// - On small screens: stacked (no sticky / no forced heights).

import type { ReactNode } from "react";

export default function FocusedJobSplitView(props: {
  left: ReactNode;
  right: ReactNode;
}): JSX.Element {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-6 lg:px-8">
        <div className="grid min-h-0 gap-4 lg:grid-cols-12">
          {/* Left column */}
          <div className="min-h-0 min-w-0 lg:col-span-7 xl:col-span-8">
            {props.left}
          </div>

          {/* Right column (panel) */}
          <div className="min-h-0 min-w-0 lg:col-span-5 xl:col-span-4">
            <div
              className="
                min-h-0
                lg:sticky lg:top-4
                lg:h-[calc(100vh-2rem)]
                lg:overflow-auto
              "
            >
              {props.right}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
