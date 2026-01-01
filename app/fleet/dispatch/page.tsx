// app/fleet/dispatch/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import FleetDispatchBoard from "@/features/fleet/components/FleetDispatchBoard";

export default function Page() {
  return <FleetDispatchBoard />;
}