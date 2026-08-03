import type { InspectionReport } from "@/features/inspections/lib/inspection/report";
import InspectionPhotoGallery from "@/features/inspections/components/inspection/InspectionPhotoGallery";

const labels = {
  ok: "Pass",
  fail: "Needs attention",
  recommend: "Recommended",
  na: "Not applicable",
  not_checked: "Not checked",
} as const;

export function InspectionReportView({
  report,
  technicianName,
  finalizedAt,
}: {
  report: InspectionReport;
  technicianName: string | null;
  finalizedAt: string | null;
}) {
  return (
    <article className="space-y-6">
      <header className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
          Professional inspection report
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{report.title}</h1>
        <div className="mt-3 grid gap-2 text-sm text-[color:var(--theme-text-secondary)] sm:grid-cols-2">
          <div>Customer: {report.customerName ?? "—"}</div>
          <div>Vehicle: {report.vehicleLabel ?? "—"}</div>
          <div>VIN: {report.vin ?? "—"}</div>
          <div>Mileage: {report.mileage ?? "—"}</div>
          <div>Technician: {technicianName ?? "—"}</div>
          <div>
            Finalized:{" "}
            {finalizedAt ? new Date(finalizedAt).toLocaleString() : "—"}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Checked", report.totals.checked],
          ["Passed", report.totals.ok],
          ["Attention", report.totals.failed],
          ["Recommended", report.totals.recommended],
          ["N/A", report.totals.notApplicable],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"
          >
            <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
              {label}
            </div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </section>

      {report.sections.map((section) => (
        <section
          key={section.title}
          className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
        >
          <h2 className="border-b border-[color:var(--theme-border-soft)] px-5 py-4 text-lg font-semibold">
            {section.title}
          </h2>
          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {section.items.map((item, index) => (
              <div key={`${item.label}-${index}`} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-semibold">{item.label}</h3>
                  <span className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs font-semibold">
                    {labels[item.status]}
                  </span>
                </div>
                {item.value ? (
                  <div className="mt-2 text-sm">Measurement: {item.value}</div>
                ) : null}
                {item.note ? (
                  <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                    {item.note}
                  </p>
                ) : null}
                {item.recommendations.length ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-[color:var(--theme-text-secondary)]">
                    {item.recommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ul>
                ) : null}
                {item.photoUrls.length ? (
                  <InspectionPhotoGallery
                    className="mt-4"
                    allowMarkup={false}
                    photos={item.photoUrls.map((url, photoIndex) => ({
                      id: `${url}-${photoIndex}`,
                      url,
                      label: `${item.label} evidence ${photoIndex + 1}`,
                    }))}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
