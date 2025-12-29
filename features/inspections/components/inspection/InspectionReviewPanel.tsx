// features/inspections/components/inspection/InspectionReviewPanel.tsx
"use client";

import { useMemo, useState } from "react";
import type {
  InspectionSession,
  InspectionItem,
} from "@inspections/lib/inspection/types";
import CustomerVehicleHeader from "@inspections/lib/inspection/ui/CustomerVehicleHeader";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import InspectionSignaturePanel from "@inspections/components/inspection/InspectionSignaturePanel";
import { Button } from "@shared/components/ui/Button";

type Props = {
  session: InspectionSession;
  workOrderLineId: string | null;
  /** Optional – if you want to react when session changes (e.g. mark completed) */
  onSessionChange?: (next: InspectionSession) => void;
};

type Stats = {
  total: number;
  pass: number;
  fail: number;
  recommend: number;
};

function calcStats(session: InspectionSession): Stats {
  let total = 0;
  let pass = 0;
  let fail = 0;
  let recommend = 0;

  for (const section of session.sections ?? []) {
    for (const it of section.items ?? []) {
      total += 1;
      const status = (it.status ?? "").toLowerCase();
      if (status === "ok" || status === "pass" || status === "good") pass += 1;
      else if (status === "fail") fail += 1;
      else if (status === "recommend" || status === "recommended") recommend += 1;
    }
  }

  return { total, pass, fail, recommend };
}

function flattenItems(session: InspectionSession): Array<{
  sectionTitle: string;
  item: InspectionItem;
}> {
  const out: Array<{ sectionTitle: string; item: InspectionItem }> = [];
  for (const section of session.sections ?? []) {
    const title = section.title ?? "Section";
    for (const item of section.items ?? []) {
      out.push({ sectionTitle: title, item });
    }
  }
  return out;
}

export default function InspectionReviewPanel({
  session,
  workOrderLineId,
  onSessionChange,
}: Props) {
  const [downloading, setDownloading] = useState(false);

  const stats = useMemo(() => calcStats(session), [session]);
  const flatItems = useMemo(() => flattenItems(session), [session]);

  const templateName = session.templateName ?? "Inspection";

  const customer = session.customer
    ? {
        first_name: session.customer.first_name ?? undefined,
        last_name: session.customer.last_name ?? undefined,
        phone: session.customer.phone ?? undefined,
        email: session.customer.email ?? undefined,
        address: session.customer.address ?? undefined,
        city: session.customer.city ?? undefined,
        province: session.customer.province ?? undefined,
        postal_code: session.customer.postal_code ?? undefined,
      }
    : undefined;

  const vehicle = session.vehicle
    ? {
        year: session.vehicle.year ?? undefined,
        make: session.vehicle.make ?? undefined,
        model: session.vehicle.model ?? undefined,
        vin: session.vehicle.vin ?? undefined,
        license_plate: session.vehicle.license_plate ?? undefined,
        mileage: session.vehicle.mileage ?? undefined,
        color: session.vehicle.color ?? undefined,
        unit_number: session.vehicle.unit_number ?? undefined,
        odometer: session.vehicle.mileage ?? undefined,
      }
    : undefined;

  const customerDefaultName = (() => {
    const c = session.customer;
    if (!c) return undefined;

    const first = c.first_name ?? "";
    const last = c.last_name ?? "";
    const joined = `${first} ${last}`.trim();

    return joined || undefined;
  })();

  const handleDownloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);

    try {
      const filenameBase =
        session.templateName?.replace(/[^\w\-]+/g, "_") || "inspection";
      const filename = `${filenameBase}.pdf`;

      const res = await fetch("/api/inspections/submit/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-filename": filename,
        },
        body: JSON.stringify({ summary: session }),
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("PDF generation failed", await res.text().catch(() => ""));
        alert("Failed to generate PDF.");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("PDF download error:", e);
      alert("Failed to download PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Header w/ customer + vehicle */}
      <CustomerVehicleHeader
        templateName={templateName}
        customer={customer}
        vehicle={vehicle}
        rightSlot={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {workOrderLineId && (
              <>
                <SaveInspectionButton
                  session={session}
                  workOrderLineId={workOrderLineId}
                />
                <FinishInspectionButton
                  session={session}
                  workOrderLineId={workOrderLineId}
                />
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="border-[rgba(184,115,51,0.75)] text-[11px] tracking-[0.16em] uppercase"
            >
              {downloading ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        }
      />

      {/* High-level stats */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-200">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Overall Summary
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-md border border-zinc-800/80 bg-zinc-900/80 px-3 py-2">
            <div className="text-[10px] uppercase text-zinc-500">Total items</div>
            <div className="text-lg font-semibold text-zinc-50">{stats.total}</div>
          </div>
          <div className="rounded-md border border-emerald-600/60 bg-emerald-950/60 px-3 py-2">
            <div className="text-[10px] uppercase text-emerald-300">Pass</div>
            <div className="text-lg font-semibold text-emerald-100">{stats.pass}</div>
          </div>
          <div className="rounded-md border border-red-600/60 bg-red-950/60 px-3 py-2">
            <div className="text-[10px] uppercase text-red-300">Fail</div>
            <div className="text-lg font-semibold text-red-100">{stats.fail}</div>
          </div>
          <div className="rounded-md border border-amber-500/60 bg-amber-950/60 px-3 py-2">
            <div className="text-[10px] uppercase text-amber-300">Recommend</div>
            <div className="text-lg font-semibold text-amber-100">
              {stats.recommend}
            </div>
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Line items
          </div>
          <div className="text-[11px] text-zinc-500">
            Scroll to review before signing.
          </div>
        </div>

        {flatItems.length === 0 ? (
          <p className="text-sm text-zinc-400">No inspection items captured.</p>
        ) : (
          <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto pr-1 text-xs">
            {flatItems.map(({ sectionTitle, item }, idx) => {
              const status = (item.status ?? "").toLowerCase();
              let statusLabel = item.status ?? "—";
              let statusClass =
                "inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-200";

              if (status === "fail") {
                statusLabel = "Fail";
                statusClass =
                  "inline-flex rounded-full border border-red-500/70 bg-red-900/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-100";
              } else if (status === "recommend" || status === "recommended") {
                statusLabel = "Recommend";
                statusClass =
                  "inline-flex rounded-full border border-amber-500/70 bg-amber-900/25 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-100";
              } else if (status === "ok" || status === "pass" || status === "good") {
                statusLabel = "OK";
                statusClass =
                  "inline-flex rounded-full border border-emerald-500/70 bg-emerald-900/25 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-100";
              }

              const value =
                item.value !== undefined && item.value !== null
                  ? String(item.value)
                  : null;
              const unit = item.unit ?? "";

              return (
                <div
                  key={`${sectionTitle}-${idx}-${item.item ?? item.name ?? "item"}`}
                  className="rounded-md border border-zinc-800/80 bg-black/60 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] text-zinc-500">
                        {sectionTitle}
                      </div>
                      <div className="truncate text-sm font-medium text-zinc-50">
                        {item.item ?? item.name ?? "Inspection item"}
                      </div>
                      {item.notes && (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">
                          Notes: {item.notes}
                        </div>
                      )}
                      {value && (
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          Measurement:{" "}
                          <span className="font-mono">
                            {value}
                            {unit ? ` ${unit}` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className={statusClass}>{statusLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transcript (if using voice) */}
      {session.transcript && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-200">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Voice notes transcript
          </div>
          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] text-zinc-300">
            {session.transcript}
          </div>
        </div>
      )}

      {/* Signatures */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Signatures
        </div>

        {!session.id && (
          <p className="mb-2 text-[11px] text-amber-300">
            This inspection does not have a persistent <code>id</code> on the session
            object yet. Technician / customer signatures will be blocked until an
            inspection record is created and its id is passed down.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {/* Technician signature – no default name until it’s part of the session type */}
          <InspectionSignaturePanel
            inspectionId={session.id as string | undefined | null}
            role="technician"
            onSigned={() => {
              if (!onSessionChange) return;
              onSessionChange({
                ...session,
                signedByTech: true,
              } as InspectionSession);
            }}
          />

          {/* Customer signature */}
          <InspectionSignaturePanel
            inspectionId={session.id as string | undefined | null}
            role="customer"
            defaultName={customerDefaultName}
            onSigned={() => {
              if (!onSessionChange) return;
              onSessionChange({
                ...session,
                signedByCustomer: true,
              } as InspectionSession);
            }}
          />
        </div>
      </div>
    </div>
  );
}