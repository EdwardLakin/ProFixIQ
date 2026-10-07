import type { OpsMarketingFunnelSnapshot } from "@/features/ops/server/get-marketing-funnel";

function number(value: number): string {
  return new Intl.NumberFormat("en-CA").format(value);
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function pretty(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{detail}</div>
    </div>
  );
}

export default function OpsMarketingFunnel({
  snapshot,
}: {
  snapshot: OpsMarketingFunnelSnapshot;
}) {
  const { summary } = snapshot;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Acquisition</div>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Marketing Funnel</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Read-only 30-day acquisition telemetry from the first-party marketing event ledger. Counts are event volume,
          not unique visitors. The measured funnel currently ends at authoritative Stripe checkout start; signup and
          onboarding completion remain intentionally deferred until their server-side success boundaries are wired.
        </p>
      </div>

      {snapshot.breakdownTruncated ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Summary totals are exact, but source and package breakdowns show only the newest 20,000 events in this 30-day window.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Pricing views" value={number(summary.pricingViews)} detail="Public pricing page views" />
        <MetricCard
          label="Checkout intent"
          value={number(summary.checkoutIntentClicks)}
          detail={`${number(summary.trialClicks)} trial · ${number(summary.subscribeClicks)} paid`}
        />
        <MetricCard
          label="Checkout started"
          value={number(summary.checkoutStarted)}
          detail={`${number(summary.trialCheckouts)} trial · ${number(summary.paidCheckouts)} paid`}
        />
        <MetricCard
          label="Intent → checkout"
          value={percent(summary.intentToCheckoutStartPct)}
          detail="Event progression, not visitor conversion"
        />
        <MetricCard label="Demo clicks" value={number(summary.demoClicks)} detail="Public demo acquisition intent" />
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5">
        <div>
          <h2 className="font-bold">By source page</h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Public acquisition intent with authoritative checkout starts attributed back to the originating source page.
          </p>
        </div>

        {snapshot.sources.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-center text-sm text-[color:var(--theme-text-muted)]">
            No source-page events in the current 30-day window.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">
                <tr className="border-b border-[color:var(--theme-border-soft)]">
                  <th className="px-3 py-2 font-bold">Source</th>
                  <th className="px-3 py-2 text-right font-bold">Pricing</th>
                  <th className="px-3 py-2 text-right font-bold">Trial</th>
                  <th className="px-3 py-2 text-right font-bold">Paid</th>
                  <th className="px-3 py-2 text-right font-bold">Demo</th>
                  <th className="px-3 py-2 text-right font-bold">Checkout</th>
                  <th className="px-3 py-2 text-right font-bold">Progression</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.sources.map((row) => (
                  <tr key={row.sourcePath} className="border-b border-[color:var(--theme-border-soft)] last:border-0">
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-semibold">{row.sourcePath}</td>
                    <td className="px-3 py-3 text-right">{number(row.pricingViews)}</td>
                    <td className="px-3 py-3 text-right">{number(row.trialClicks)}</td>
                    <td className="px-3 py-3 text-right">{number(row.subscribeClicks)}</td>
                    <td className="px-3 py-3 text-right">{number(row.demoClicks)}</td>
                    <td className="px-3 py-3 text-right font-bold">{number(row.checkoutStarted)}</td>
                    <td className="px-3 py-3 text-right">{percent(row.intentToCheckoutStartPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5">
        <div>
          <h2 className="font-bold">By product package</h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Trial and paid acquisition intent compared with authoritative Stripe checkout starts.
          </p>
        </div>

        {snapshot.packages.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-center text-sm text-[color:var(--theme-text-muted)]">
            No package-attributed events in the current 30-day window.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">
                <tr className="border-b border-[color:var(--theme-border-soft)]">
                  <th className="px-3 py-2 font-bold">Package</th>
                  <th className="px-3 py-2 text-right font-bold">Trial intent</th>
                  <th className="px-3 py-2 text-right font-bold">Paid intent</th>
                  <th className="px-3 py-2 text-right font-bold">Checkout starts</th>
                  <th className="px-3 py-2 text-right font-bold">Trial starts</th>
                  <th className="px-3 py-2 text-right font-bold">Paid starts</th>
                  <th className="px-3 py-2 text-right font-bold">Progression</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.packages.map((row) => (
                  <tr key={row.packageKey} className="border-b border-[color:var(--theme-border-soft)] last:border-0">
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{pretty(row.packageKey)}</td>
                    <td className="px-3 py-3 text-right">{number(row.trialClicks)}</td>
                    <td className="px-3 py-3 text-right">{number(row.subscribeClicks)}</td>
                    <td className="px-3 py-3 text-right font-bold">{number(row.checkoutStarted)}</td>
                    <td className="px-3 py-3 text-right">{number(row.trialCheckouts)}</td>
                    <td className="px-3 py-3 text-right">{number(row.paidCheckouts)}</td>
                    <td className="px-3 py-3 text-right">{percent(row.intentToCheckoutStartPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="text-xs text-[color:var(--theme-text-muted)]">
        Window starts {new Date(snapshot.since).toLocaleString("en-CA")} · {number(summary.totalEvents)} total recorded marketing events.
      </div>
    </div>
  );
}
