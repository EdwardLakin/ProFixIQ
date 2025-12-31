// app/inspections/genericInspection/page.tsx

import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";

// This route is always dynamic (it reads from Supabase, sessionStorage, etc.)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function GenericInspectionPage() {
  // GenericInspectionScreen already reads search params itself via useSearchParams
  // and handles all the inspection logic. We just mount it as the page.
  return <GenericInspectionScreen />;
}