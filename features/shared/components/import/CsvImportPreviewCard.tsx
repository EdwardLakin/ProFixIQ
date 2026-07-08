import type { ReactNode } from "react";

export type CsvImportPreviewMetric = {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "error";
};

type Props = {
  fileName?: string | null;
  headersCount?: number;
  parsedRows: number;
  readyRows: number;
  needsReviewRows?: number;
  duplicateRows?: number;
  invalidRows?: number;
  parseError?: string | null;
  children?: ReactNode;
};

const toneClassName: Record<
  NonNullable<CsvImportPreviewMetric["tone"]>,
  string
> = {
  default: "border-white/10 bg-white/[0.03] text-white",
  success: "border-emerald-500/20 bg-emerald-950/20 text-emerald-100",
  warning: "border-amber-500/20 bg-amber-950/20 text-amber-100",
  error: "border-red-500/20 bg-red-950/20 text-red-100",
};

export function CsvImportPreviewCard({
  fileName,
  headersCount = 0,
  parsedRows,
  readyRows,
  needsReviewRows = 0,
  duplicateRows = 0,
  invalidRows = 0,
  parseError,
  children,
}: Props) {
  const metrics: CsvImportPreviewMetric[] = [
    { label: "Parsed Rows", value: parsedRows },
    { label: "Ready to Import", value: readyRows, tone: "success" },
    {
      label: "Needs Review",
      value: needsReviewRows,
      tone: needsReviewRows ? "warning" : "default",
    },
    {
      label: "Duplicate Rows",
      value: duplicateRows,
      tone: duplicateRows ? "warning" : "default",
    },
    {
      label: "Invalid Rows",
      value: invalidRows,
      tone: invalidRows ? "error" : "default",
    },
  ];

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-neutral-300">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="font-semibold text-neutral-100">Selected file:</span>{" "}
          {fileName ?? "No CSV selected"}
        </div>
        {headersCount > 0 ? (
          <div className="text-xs text-neutral-400">
            Detected {headersCount} columns
          </div>
        ) : null}
      </div>
      {parseError ? (
        <div className="mt-3 rounded-lg border border-red-500/25 bg-red-950/30 p-2 text-red-100">
          {parseError}
        </div>
      ) : null}
      {parsedRows > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-lg border p-2 ${toneClassName[metric.tone ?? "default"]}`}
            >
              <div className="text-lg font-semibold">{metric.value}</div>
              <div className="text-xs text-neutral-400">{metric.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}
