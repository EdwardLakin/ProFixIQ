// Server component wrapper (no "use client")
import CustomRunPage from "@/features/inspections/app/inspection/custom-run/page";

export const dynamic = "force-dynamic"; // optional, if you need runtime params each load
export default function Page() {
  return <CustomRunPage />;
}