import Link from "next/link";
import { loadShadowPreviewContext } from "@/features/integrations/shopBoost/shadowShop";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

type PageProps = {
  params: Promise<{ demoId: string }>;
  searchParams: Promise<{ intakeId?: string; sender?: string }>;
};

export default async function DemoReportPage({ params, searchParams }: PageProps) {
  const { demoId } = await params;
  const sp = await searchParams;
  const intakeId = typeof sp.intakeId === "string" ? sp.intakeId : "";
  const sender = typeof sp.sender === "string" ? sp.sender : null;

  const context = intakeId ? await loadShadowPreviewContext({ demoId, intakeId }) : null;
  if (!context) {
    return (
      <div className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-lg font-semibold">Report unavailable</p>
          <p className="mt-2 text-sm text-neutral-400">This report link is missing context or has expired.</p>
        </div>
      </div>
    );
  }

  const { snapshot } = context;

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Shop Boost report</p>
          <h1 className="mt-1 text-2xl font-semibold">This analysis was generated for {context.shopName}</h1>
          <p className="mt-2 text-sm text-neutral-300">{sender ? `Sent by ${sender}. ` : ""}Based on uploaded data only. Conservative projections.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <p className="font-semibold text-white">ROI summary</p>
            <p className="mt-2 text-emerald-100">{formatMoney(snapshot.roi.estimated_monthly_impact)}/month estimated impact</p>
            <p className="text-emerald-100">{snapshot.roi.approval_speed_gain}% faster approvals</p>
            <p className="text-emerald-100">{snapshot.roi.labor_recovery_hours} labor hrs recovered</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-300">
            <p className="font-semibold text-white">Before vs after</p>
            <p className="mt-2">Approval rate: {snapshot.impactComparison.before.approval_rate}% → {snapshot.impactComparison.after.approval_rate}%</p>
            <p>Completion time: {snapshot.impactComparison.before.avg_job_completion_time}d → {snapshot.impactComparison.after.avg_job_completion_time}d</p>
            <p>Parts sync: {snapshot.impactComparison.before.parts_sync_rate}% → {snapshot.impactComparison.after.parts_sync_rate}%</p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Blockers and urgency</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>{snapshot.urgencySignals.stalledJobs} jobs currently stalled.</li>
            <li>{formatMoney(snapshot.urgencySignals.revenueAtRiskNow)} at risk now.</li>
            <li>{snapshot.operationalNarrative.unresolvedCustomerVehicleLinks} customer/vehicle links need review.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          <p className="font-semibold">Trust statement</p>
          <p className="mt-1">Confidence: {snapshot.projectionConfidence.label} ({snapshot.projectionConfidence.score}%).</p>
          <p className="mt-1">Projection uses uploaded data, conservative patterns, and explicit assumptions.</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-300">
          <p className="font-semibold text-white">Next step</p>
          <p className="mt-1">Activate your shop and recover {formatMoney(snapshot.roi.estimated_monthly_impact)}/month.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/demo/preview/${context.demoId}?intakeId=${context.intakeId}&mode=sales`} className="rounded-md bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-black">Resume analysis</Link>
            <Link href={`/api/shop-boost/intakes/${context.intakeId}/report?pdf=1`} className="rounded-md border border-white/20 px-3 py-2 text-xs">Download PDF</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
