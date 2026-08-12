// Server component wrapper (no "use client")
import InspectionTemplateEditRouter from "@/features/inspections/components/InspectionTemplateEditRouter";

export const dynamic = "force-dynamic"; // optional, if you need runtime params each load
export default function Page() {
  return <InspectionTemplateEditRouter />;
}
