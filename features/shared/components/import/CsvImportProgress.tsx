export type CsvImportProgressPhase =
  | "idle"
  | "reading_file"
  | "validating"
  | "matching"
  | "importing"
  | "finalizing"
  | "completed"
  | "failed";

export type CsvImportProgressState = {
  phase: string;
  phaseKey?: CsvImportProgressPhase;
  processed: number;
  total: number;
  percent: number;
};

type Props = {
  progress: CsvImportProgressState | null;
  label?: string;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function CsvImportProgress({
  progress,
  label = "CSV import progress",
}: Props) {
  if (!progress) return null;

  const total = Math.max(0, progress.total);
  const processed = Math.max(
    0,
    Math.min(progress.processed, total || progress.processed),
  );
  const percent = clampPercent(progress.percent);
  const isFailed = progress.phaseKey === "failed";
  const isCompleted = progress.phaseKey === "completed" || percent === 100;
  const panelClass = isFailed
    ? "border-red-500/25 bg-red-950/25 text-red-50"
    : isCompleted
      ? "border-emerald-500/25 bg-emerald-950/25 text-emerald-50"
      : "border-sky-500/25 bg-sky-950/20 text-sky-50";

  return (
    <div
      className={`mt-4 rounded-xl border p-3 text-sm ${panelClass}`}
      role="status"
      aria-live="polite"
      data-testid="csv-import-progress"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
            {label}
          </div>
          <div className="font-semibold">{progress.phase}</div>
        </div>
        <div className="text-xs opacity-80">
          {total > 0 ? `${processed}/${total} rows · ` : ""}
          {percent}%
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/35">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isFailed
              ? "bg-red-400"
              : "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))]"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
