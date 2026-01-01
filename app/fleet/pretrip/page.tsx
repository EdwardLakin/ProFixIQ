// app/fleet/pretrip/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import PretripReportsPage from "@/features/fleet/components/PretripReportsPage";

export default function Page() {
  return <PretripReportsPage />;
}