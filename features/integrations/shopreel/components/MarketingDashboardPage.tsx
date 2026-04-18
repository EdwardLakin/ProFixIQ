import Link from "next/link";

import PageShell from "@/features/shared/components/PageShell";
import { getMarketingDashboardData } from "../server/getMarketingDashboardData";
import RetryDeliveryButton from "./RetryDeliveryButton";
import ShopReelLifecycleQueue from "./ShopReelLifecycleQueue";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusBadge(status: "pending" | "success" | "failed") {
  if (status === "success") {
    return <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Success</span>;
  }

  if (status === "failed") {
    return <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">Failed</span>;
  }

  return <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">Pending</span>;
}

export default async function MarketingDashboardPage() {
  const data = await getMarketingDashboardData();

  if (!data.authorized) {
    return (
      <PageShell title="Marketing">
        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">{data.reason}</div>
      </PageShell>
    );
  }

  const { integration, deliveries, sourceHealth, lifecycle, pipeline, needsAttention } = data;

  return (
    <PageShell title="Marketing">
      <div className="space-y-6">
        <section className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">ShopReel Command Center</h1>
              <p className="mt-2 text-sm text-white/70">
                Operational visibility across ingest, content pipeline, publishing, and delivery reliability.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/owner/marketing"
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5"
              >
                Manage settings
              </Link>
              <a
                href={integration.shopreelBaseUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black"
              >
                Open ShopReel
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white xl:col-span-2">
            <div className="text-sm text-white/60">Integration status</div>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
              {integration.enabled ? "Enabled" : "Disabled"}
              {integration.enabled ? (
                <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                  Live
                </span>
              ) : (
                <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
                  Action required
                </span>
              )}
            </div>
            <div className="mt-3 text-xs text-white/60">Remote shop: {integration.remoteShopId ?? "Not configured"}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white">
            <div className="text-sm text-white/60">Story sources</div>
            <div className="mt-2 text-2xl font-semibold">{lifecycle.sourceCount}</div>
            <div className="mt-1 text-xs text-white/60">Ingested canonical source records</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white">
            <div className="text-sm text-white/60">New opportunities</div>
            <div className="mt-2 text-2xl font-semibold">{lifecycle.newOpportunities}</div>
            <div className="mt-1 text-xs text-white/60">Awaiting queue action</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white">
            <div className="text-sm text-white/60">Dismissed / accepted</div>
            <div className="mt-2 text-2xl font-semibold">{lifecycle.dismissedOpportunities} / {lifecycle.acceptedOpportunities}</div>
            <div className="mt-1 text-xs text-white/60">Opportunity decisions</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white">
            <div className="text-sm text-white/60">Drafts awaiting review</div>
            <div className="mt-2 text-2xl font-semibold">{lifecycle.draftsAwaitingReview}</div>
            <div className="mt-1 text-xs text-white/60">{lifecycle.approvedItems} approved</div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white xl:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Needs attention</h2>
              <Link href="/dashboard/owner/marketing" className="text-xs text-white/70 hover:text-white">
                Resolve in settings
              </Link>
            </div>

            {needsAttention.length ? (
              <ul className="mt-4 space-y-2">
                {needsAttention.map((item) => (
                  <li key={item} className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-100">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-3 py-3 text-sm text-emerald-100">
                No urgent blockers detected. Ingest and publishing signals are currently healthy.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
            <h2 className="text-lg font-semibold">Primary actions</h2>
            <div className="mt-3 space-y-2 text-sm">
              <Link href="/dashboard/owner/marketing" className="block rounded-md border border-white/10 px-3 py-2 hover:bg-white/5">
                Configure integration and event types
              </Link>
              <div className="rounded-md border border-white/10 px-3 py-2">
                <div className="text-white/90">Operational signal ingest endpoint</div>
                <div className="mt-1 text-xs text-white/60">POST /api/shopreel/operational-signals (owner-authenticated) to push live operational opportunities.</div>
              </div>
              <a
                href={integration.shopreelBaseUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
              >
                Open ShopReel workspace
              </a>
            </div>
          </div>
        </section>



        <ShopReelLifecycleQueue opportunities={lifecycle.opportunities} drafts={lifecycle.drafts} />
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
            <h2 className="text-lg font-semibold">Source ingest health</h2>
            <p className="mt-1 text-sm text-white/60">Signals below are transport diagnostics from delivery logs grouped by ShopReel event type.</p>

            <div className="mt-4 space-y-2">
              {sourceHealth.map((eventHealth) => (
                <div key={eventHealth.eventType} className="rounded-md border border-white/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{eventHealth.eventType}</div>
                    {eventHealth.lastStatus ? statusBadge(eventHealth.lastStatus) : <span className="text-xs text-white/40">No signal yet</span>}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {eventHealth.successes} success / {eventHealth.failures} failed / {eventHealth.attempts} attempts · last seen {formatDate(eventHealth.lastSeenAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
            <h2 className="text-lg font-semibold">Content and publish pipeline</h2>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                <span>Publications queued / scheduled / publishing</span>
                <span>{pipeline.publicationsQueued} / {pipeline.publicationsScheduled} / {pipeline.publicationsPublishing}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                <span>Publish jobs queued / running / failed</span>
                <span>{pipeline.publishJobsQueued} / {pipeline.publishJobsRunning} / {pipeline.publishJobsFailed}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                <span>Manual assets (total / draft)</span>
                <span>{pipeline.manualAssetsTotal} / {pipeline.manualAssetsDraft}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                <span>Active social connections</span>
                <span>{pipeline.activeConnections}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                <span>Tokens expiring soon ({"<"}72h)</span>
                <span>{pipeline.tokenExpiringSoon}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          <h2 className="text-lg font-semibold">Recent delivery activity</h2>
          <p className="mt-1 text-sm text-white/60">Latest delivery attempts from ProFixIQ into ShopReel.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-white/60">
                <tr className="border-b border-white/10">
                  <th className="py-3 pr-4">Event</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">HTTP</th>
                  <th className="py-3 pr-4">Created</th>
                  <th className="py-3 pr-4">Delivered</th>
                  <th className="py-3 pr-4">Error</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.length ? (
                  deliveries.map((delivery) => (
                    <tr key={delivery.id} className="border-b border-white/5 align-top">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-white">{delivery.eventType}</div>
                        <div className="text-xs text-white/50">{delivery.eventKey}</div>
                      </td>
                      <td className="py-3 pr-4">{statusBadge(delivery.status)}</td>
                      <td className="py-3 pr-4">{delivery.httpStatus ?? "—"}</td>
                      <td className="py-3 pr-4">{formatDate(delivery.createdAt)}</td>
                      <td className="py-3 pr-4">{formatDate(delivery.deliveredAt)}</td>
                      <td className="py-3 pr-4 text-xs text-white/60">{delivery.errorMessage ?? "—"}</td>
                      <td className="py-3 pr-4">
                        {delivery.status === "failed" ? (
                          <RetryDeliveryButton deliveryId={delivery.id} />
                        ) : (
                          <span className="text-xs text-white/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-white/50">
                      No ShopReel delivery attempts yet. Start by enabling integration settings, then complete an inspection or work order event.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          <h2 className="text-lg font-semibold">Integration diagnostics</h2>
          <div className="mt-3 grid gap-2 text-sm text-white/70">
            <div>Base URL: {integration.shopreelBaseUrl}</div>
            <div>Remote Shop ID: {integration.remoteShopId ?? "Not set"}</div>
            <div>Enabled event types: {integration.enabledEventTypes.length ? integration.enabledEventTypes.join(", ") : "None selected"}</div>
            <div>Last tested: {formatDate(integration.lastTestedAt)}</div>
            <div>Last success: {formatDate(integration.lastSuccessAt)}</div>
            <div>Last error: {formatDate(integration.lastErrorAt)}</div>
            <div>Last error message: {integration.lastErrorMessage ?? "None"}</div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
