import Link from "next/link";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { WorkforceQuickLinks } from "@/features/dashboard/app/dashboard/workforce/WorkforceQuickLinks";

export default async function WorkforceTimeOffPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
      <h1 className="text-2xl font-semibold text-white">Time Away Command</h1>
      <p className="text-sm text-neutral-300">Approve and coordinate time-away requests through Scheduling while maintaining daily coverage.</p>
      <WorkforceQuickLinks roleScope="manager" className="flex flex-wrap gap-2" />
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-neutral-200">
        <p>Today, request review and approval workflows run from the Scheduling Command.</p>
        <p className="mt-2 text-neutral-400">A dedicated Time Away workspace is planned next, focused on balances and policy reporting without changing current approval flow.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/workforce/scheduling" className="inline-block rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Open Scheduling</Link>
        <Link href="/dashboard/workforce/attendance" className="inline-block rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Open Attendance</Link>
      </div>
    </div>
  );
}
