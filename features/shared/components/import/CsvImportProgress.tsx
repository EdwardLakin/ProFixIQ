export type CsvImportProgressState = {
  phase: string;
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

  return (
    <div
      className="mt-4 rounded-xl border border-sky-500/25 bg-sky-950/20 p-3 text-sm text-sky-50"
      role="status"
      aria-live="polite"
      data-testid="csv-import-progress"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100/70">
            {label}
          </div>
          <div className="font-semibold text-sky-50">{progress.phase}</div>
        </div>
        <div className="text-xs text-sky-100/80">
          {processed}/{total} rows · {percent}%
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/35">
        <div
          className="h-full rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
