import PortalShell from "@/features/portal/components/PortalShell";
import Link from "next/link";

const muted = "text-neutral-400";
const glass =
  "rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card";

export default function PortalPartsPage() {
  return (
    <PortalShell
      title="Customer Portal"
      subtitle="Parts approvals, requested parts, and statuses"
    >
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Parts
          </div>
          <h1 className="font-header text-3xl text-orange-400">Parts & Approvals</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            If your shop requests parts approval, you’ll see them here.
          </p>
        </div>

        <div className={glass}>
          <div className="text-sm font-semibold text-neutral-100">What you can do here</div>
          <ul className={`mt-2 list-disc pl-5 text-sm ${muted} space-y-1`}>
            <li>Review requested parts from the shop</li>
            <li>Approve or decline before ordering</li>
            <li>Track status (requested → approved → ordered → installed)</li>
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/portal/request/when"
              className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-xs font-semibold text-neutral-100 hover:bg-black/70"
            >
              Start a new request
            </Link>
            <Link
              href="/portal/history"
              className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-xs font-semibold text-neutral-100 hover:bg-black/70"
            >
              View history
            </Link>
          </div>
        </div>

        <div className={`${glass} ${muted} text-sm`}>
          Next step: wire this page to your parts-request table/view once we confirm the exact
          schema you’re using for portal approvals.
        </div>
      </div>
    </PortalShell>
  );
}
