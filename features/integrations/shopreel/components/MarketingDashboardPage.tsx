import Link from "next/link";
import PageShell from "@/features/shared/components/PageShell";
import { getMarketingDashboardData } from "../server/getMarketingDashboardData";
import RetryDeliveryButton from "./RetryDeliveryButton";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default async function MarketingDashboardPage() {
  const data = await getMarketingDashboardData();

  if (!data.authorized) {
    return (
      <PageShell title="Marketing">
        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          {data.reason}
        </div>
      </PageShell>
    );
  }

  const { integration, deliveries } = data;

  return (
    <PageShell title="Marketing">
      <div className="space-y-6">
        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Marketing</h1>
              <p className="mt-2 text-sm text-white/70">
                Monitor ProFixIQ → ShopReel automation for your shop.
              </p>
            </div>

            <div className="flex gap-3">
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
                View in ShopReel
              </a>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white">
            <div className="text-sm text-white/60">Integration</div>
            <div className="mt-2 text-lg font-semibold">
              {integration.enabled ? "Enabled" : "Disabled"}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white">
            <div className="text-sm text-white/60">Last success</div>
            <div className="mt-2 text-sm font-medium">
              {formatDate(integration.lastSuccessAt)}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white">
            <div className="text-sm text-white/60">Last test</div>
            <div className="mt-2 text-sm font-medium">
              {formatDate(integration.lastTestedAt)}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white">
            <div className="text-sm text-white/60">Last error</div>
            <div className="mt-2 text-sm font-medium">
              {formatDate(integration.lastErrorAt)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          <h2 className="text-lg font-semibold">Recent events sent</h2>
          <p className="mt-1 text-sm text-white/60">
            Latest delivery attempts from ProFixIQ into ShopReel.
          </p>

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
                      <td className="py-3 pr-4">{delivery.status}</td>
                      <td className="py-3 pr-4">{delivery.httpStatus ?? "—"}</td>
                      <td className="py-3 pr-4">{formatDate(delivery.createdAt)}</td>
                      <td className="py-3 pr-4">{formatDate(delivery.deliveredAt)}</td>
                      <td className="py-3 pr-4 text-xs text-white/60">
                        {delivery.errorMessage ?? "—"}
                      </td>
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
                      No ShopReel delivery attempts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          <h2 className="text-lg font-semibold">Sync status</h2>
          <div className="mt-3 space-y-2 text-sm text-white/70">
            <div>Base URL: {integration.shopreelBaseUrl}</div>
            <div>Remote Shop ID: {integration.remoteShopId ?? "Not set"}</div>
            <div>
              Enabled event types:{" "}
              {integration.enabledEventTypes.length
                ? integration.enabledEventTypes.join(", ")
                : "None selected"}
            </div>
            <div>Last error message: {integration.lastErrorMessage ?? "None"}</div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
