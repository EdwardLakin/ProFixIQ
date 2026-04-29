type SummaryRecord = Record<string, unknown>;

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): SummaryRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as SummaryRecord : null;
}

function readCustomerVehicleCheckpoint(summary: SummaryRecord | null | undefined): SummaryRecord | null {
  const onboardingActivation = asRecord(summary?.onboardingActivation);
  const checkpoint = asRecord(onboardingActivation?.customersVehicles);
  return checkpoint?.phase === "customers_vehicles" ? checkpoint : null;
}

export function OnboardingProgressCard({ summary }: { summary?: SummaryRecord | null }) {
  const customerVehicleCheckpoint = readCustomerVehicleCheckpoint(summary);
  const checkpointStatus = typeof customerVehicleCheckpoint?.status === "string" ? customerVehicleCheckpoint.status : null;
  const checkpointStage = typeof customerVehicleCheckpoint?.stage === "string" ? customerVehicleCheckpoint.stage : null;
  const resultCounters = asRecord(customerVehicleCheckpoint?.resultCounters);

  const liveRecordsCreated =
    asNumber(summary?.liveRecordsCreated)
    + asNumber(resultCounters?.customersInserted)
    + asNumber(resultCounters?.vehiclesInserted)
    + asNumber(resultCounters?.linksMaterialized);

  const rows = [
    ["Uploaded files", String(asNumber(summary?.uploadedFiles) || asNumber(summary?.fileCount))],
    ["Rows parsed", String(asNumber(summary?.rowsParsedTotal) || asNumber(summary?.rowsParsed))],
    ["AI sampled rows", String(asNumber(summary?.aiRowsSampled))],
    ["Persisted staged entities", String(asNumber(summary?.entitiesDiscovered))],
    ["Relationship links", String(asNumber(summary?.linksFound))],
    ["Review exceptions", String(asNumber(summary?.reviewExceptions))],
    ["Live activation records", String(liveRecordsCreated)],
    ["Customer bridge writebacks", String(asNumber(resultCounters?.customerEntityCanonicalWritebacks))],
    ["Vehicle bridge writebacks", String(asNumber(resultCounters?.vehicleEntityCanonicalWritebacks))],
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Onboarding progress</h3>
      <p className="mt-1 text-xs text-cyan-100/80">
        Uploaded files are staged first, then safe rows are activated into normal ProFixIQ tables.
      </p>
      <p className="mt-1 text-xs text-slate-300">Readiness: {String(summary?.activationReadiness ?? "not_ready")}</p>

      {checkpointStatus ? (
        <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
          <p className="font-semibold">Customer/vehicle activation: {checkpointStatus}</p>
          <p className="mt-1 text-cyan-100/80">
            Stage: {checkpointStage ?? "unknown"} · Customers: {asNumber(customerVehicleCheckpoint?.customersTotal)} · Vehicles:{" "}
            {asNumber(customerVehicleCheckpoint?.vehiclesTotal)} · Links: {asNumber(customerVehicleCheckpoint?.linksTotal)}
          </p>
          {typeof customerVehicleCheckpoint?.lastError === "string" && customerVehicleCheckpoint.lastError ? (
            <p className="mt-1 text-amber-100">Last error: {customerVehicleCheckpoint.lastError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
            <p className="text-sm text-white">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
