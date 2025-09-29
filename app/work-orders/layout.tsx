// app/work-orders/layout.tsx
import type { ReactNode } from "react";
import WOReadMarker from "@work-orders/components/WOReadMarker";

export default function WorkOrdersSectionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Marks feature as read whenever a child page renders */}
      <WOReadMarker />
      {children}
    </>
  );
}