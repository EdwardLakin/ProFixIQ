import type { InspectionReport } from "@/features/inspections/lib/inspection/report";
import InspectionPhotoGallery from "@/features/inspections/components/inspection/InspectionPhotoGallery";

export function InspectionReportView({
  report,
  technicianName,
  finalizedAt,
}: {
  report: InspectionReport;
  technicianName: string | null;
  finalizedAt: string | null;
}) {
  const genericPassed = Math.max(0, report.totals.ok - report.totals.noDefect);
  const genericFailed = Math.max(
    0,
    report.totals.failed - report.totals.majorDefects,
  );
  const genericRecommended = Math.max(
    0,
    report.totals.recommended - report.totals.minorDefects,
  );
  const hasDefectClassification = report.totals.defectItems > 0;
  const genericRowsPresent =
    !hasDefectClassification ||
    genericPassed > 0 ||
    genericFailed > 0 ||
    genericRecommended > 0;
  const summaryTiles: Array<[string, number]> = [["Checked", report.totals.checked]];
  if (genericRowsPresent) {
    summaryTiles.push(
      ["Passed", genericPassed],
      ["Attention", genericFailed],
      ["Recommended", genericRecommended],
    );
  }
  if (hasDefectClassification) {
    summaryTiles.push(
      ["No defect", report.totals.noDefect],
      ["Major", report.totals.majorDefects],
      ["Minor", report.totals.minorDefects],
    );
  }
  summaryTiles.push(["N/A", report.totals.notApplicable]);

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

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {summaryTiles.map(([label, value]) => (
          <div
            key={label}
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
                    {item.statusLabel}
                  </span>
                </div>
                {item.value ? (
                  <div className="mt-2 text-sm">
                    Measurement: {item.value}
                    {item.unit ? ` ${item.unit}` : ""}
                  </div>
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
