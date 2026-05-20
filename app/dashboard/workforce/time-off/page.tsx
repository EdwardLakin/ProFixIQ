import Link from "next/link";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceTimeOffPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
      <h1 className="text-2xl font-semibold text-white">Time Off</h1>
      <p className="text-sm text-neutral-300">Time-off approvals are currently handled in workforce scheduling.</p>
      <Link href="/dashboard/workforce/scheduling" className="inline-block rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Open Scheduling</Link>
    </div>
  );
}
