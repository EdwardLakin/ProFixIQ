import Link from "next/link";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceAttendancePage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
      <h1 className="text-2xl font-semibold text-white">Attendance</h1>
      <p className="text-sm text-neutral-300">Attendance and punch activity feed payroll review and exception workflows.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/workforce/payroll-review" className="rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Open Payroll Review</Link>
        <Link href="/dashboard/workforce/scheduling" className="rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Open Scheduling</Link>
      </div>
    </div>
  );
}
