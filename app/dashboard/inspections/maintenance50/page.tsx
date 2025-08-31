import { Suspense } from "react";
import Client from "@/features/inspections/app/inspection/maintenance50/page";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <Client />
    </Suspense>
  );
}
