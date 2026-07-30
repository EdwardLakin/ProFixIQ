"use client";

import { useEffect, useState } from "react";

type ReportLink = {
  inspectionId: string;
  title: string;
  finalizedAt: string | null;
  technicianName: string | null;
  viewUrl: string;
  pdfUrl: string;
};

export function InspectionReportAttachments({
  workOrderId,
  vehicleId,
  invoiceId,
  title = "Inspection reports",
}: {
  workOrderId?: string;
  vehicleId?: string;
  invoiceId?: string;
  title?: string;
}) {
  const [reports, setReports] = useState<ReportLink[]>([]);
  useEffect(() => {
    if (invoiceId) {
      void fetch(
        `/api/invoices/${encodeURIComponent(invoiceId)}/documents/inspection_report/signed`,
        { cache: "no-store" },
      )
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) =>
          setReports(
            typeof payload?.url === "string"
              ? [
                  {
                    inspectionId: `invoice:${invoiceId}`,
                    title: "Inspection report",
                    finalizedAt: null,
                    technicianName: null,
                    viewUrl: payload.url,
                    pdfUrl: payload.url,
                  },
                ]
              : [],
          ),
        )
        .catch(() => setReports([]));
      return;
    }

    const query = workOrderId
      ? `workOrderId=${encodeURIComponent(workOrderId)}`
      : vehicleId
        ? `vehicleId=${encodeURIComponent(vehicleId)}`
        : "";
    if (!query) return;
    void fetch(`/api/inspections/reports?${query}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setReports(payload?.reports ?? []))
      .catch(() => setReports([]));
  }, [invoiceId, vehicleId, workOrderId]);

  if (!reports.length) return null;
  return (
    <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">
        {title}
      </h2>
      <div className="mt-3 space-y-2">
        {reports.map((report) => (
          <div
            key={report.inspectionId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] p-4"
          >
            <div>
              <div className="font-semibold">{report.title}</div>
              {report.finalizedAt || report.technicianName ? (
                <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  {report.finalizedAt
                    ? new Date(report.finalizedAt).toLocaleString()
                    : "Finalized"}
                  {report.technicianName ? ` · ${report.technicianName}` : ""}
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <a className="rounded-full border px-3 py-2 text-xs" href={report.viewUrl}>
                View report
              </a>
              <a
                className="rounded-full border px-3 py-2 text-xs"
                href={report.pdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                PDF
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
