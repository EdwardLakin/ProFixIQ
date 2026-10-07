import { Inbox } from "lucide-react";
import EarlyAccessReviewActions from "@/features/ops/components/EarlyAccessReviewActions";
import { listEarlyAccessApplications } from "@/features/ops/server/earlyAccessApplications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function pretty(value: string | null): string {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function OpsEarlyAccessPage() {
  const applications = await listEarlyAccessApplications();
  const pending = applications.filter((application) => application.status === "pending");
  const reviewed = applications.filter((application) => application.status !== "pending");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Acquisition</div>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Early Access</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Review campaign applications and issue a private, product-bound signup link. Approved shops receive a 7-day
          free trial followed by 30% off the approved base subscription for the next 6 paid months.
        </p>
      </div>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Pending applications</h2>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{pending.length} waiting for review</p>
          </div>
          <Inbox className="h-5 w-5 text-sky-300" />
        </div>

        {pending.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-center text-sm text-[color:var(--theme-text-muted)]">
            No pending Early Access applications.
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            {pending.map((application) => (
              <article key={application.id} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-bold">{application.companyName}</div>
                    <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                      {application.fullName} · {application.email}{application.phone ? ` · ${application.phone}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                      {application.location || "Location not provided"} · Applied {formatDate(application.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-sky-200">
                      {pretty(application.productPackage)}
                    </span>
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-300">
                      Pending
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div><span className="text-[color:var(--theme-text-muted)]">Product</span><div className="mt-1 font-semibold">{pretty(application.productPackage)}</div></div>
                  <div><span className="text-[color:var(--theme-text-muted)]">Operation</span><div className="mt-1 font-semibold">{pretty(application.operationType)}</div></div>
                  <div><span className="text-[color:var(--theme-text-muted)]">Locations</span><div className="mt-1 font-semibold">{application.locationCount}</div></div>
                  <div><span className="text-[color:var(--theme-text-muted)]">Technicians</span><div className="mt-1 font-semibold">{application.technicianCount ?? "—"}</div></div>
                  <div><span className="text-[color:var(--theme-text-muted)]">Expected users</span><div className="mt-1 font-semibold">{application.teamSize ?? "—"}</div></div>
                  <div><span className="text-[color:var(--theme-text-muted)]">Fleet assets</span><div className="mt-1 font-semibold">{application.fleetAssetCount ?? "—"}</div></div>
                  <div><span className="text-[color:var(--theme-text-muted)]">Current software</span><div className="mt-1 font-semibold">{application.currentSoftware || "—"}</div></div>
                  <div><span className="text-[color:var(--theme-text-muted)]">Timeline</span><div className="mt-1 font-semibold">{pretty(application.purchaseTimeline)}</div></div>
                  <div><span className="text-[color:var(--theme-text-muted)]">Campaign</span><div className="mt-1 font-semibold">{application.utmCampaign || application.utmSource || "Direct"}</div></div>
                  <div className="sm:col-span-2"><span className="text-[color:var(--theme-text-muted)]">Offer terms</span><div className="mt-1 font-mono text-[11px] font-semibold">{application.offerTermsVersion}</div></div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-[color:var(--theme-text-muted)]">Interested surfaces</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {application.interestedSurfaces.map((surface) => (
                      <span key={surface} className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-200">
                        {pretty(surface)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <div className="text-xs text-[color:var(--theme-text-muted)]">Primary workflow problem</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[color:var(--theme-text-primary)]">{application.primaryChallenge}</p>
                </div>

                <EarlyAccessReviewActions applicationId={application.id} />
              </article>
            ))}
          </div>
        )}
      </section>

      {reviewed.length > 0 ? (
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 sm:p-5">
          <h2 className="font-bold">Reviewed history</h2>
          <div className="mt-3 divide-y divide-[color:var(--theme-border-soft)]">
            {reviewed.slice(0, 20).map((application) => (
              <div key={application.id} className="py-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-semibold">{application.companyName}</span>{" "}
                    <span className="text-[color:var(--theme-text-muted)]">· {pretty(application.productPackage)} · {application.email}</span>
                  </div>
                  <span className={application.status === "approved" ? "text-emerald-300" : "text-[color:var(--theme-text-muted)]"}>{pretty(application.status)}</span>
                </div>
                {application.status === "approved" ? (
                  <EarlyAccessReviewActions applicationId={application.id} mode="reissue" />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
