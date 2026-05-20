import Link from "next/link";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceCertificationsPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
      <h1 className="text-2xl font-semibold text-white">Certifications</h1>
      <p className="text-sm text-neutral-300">Certification records are managed on each person profile in People.</p>
      <Link href="/dashboard/workforce/people" className="inline-block rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Open People</Link>
    </div>
  );
}
