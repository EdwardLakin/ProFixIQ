import { GuidedImportSummary } from "./GuidedImportSummary";

type SampleRow = { row: number; reason?: string; error?: string };

type Props = {
  imported: number;
  skipped: number;
  failed: number;
  duplicates?: number;
  processingTime?: string | null;
  skippedRows?: SampleRow[];
  failedRows?: SampleRow[];
};

export function CsvImportCompletionSummary({
  imported,
  skipped,
  failed,
  duplicates = 0,
  processingTime,
  skippedRows = [],
  failedRows = [],
}: Props) {
  return (
    <GuidedImportSummary tone={failed > 0 ? "warning" : "success"}>
      <div className="font-semibold">
        Imported {imported}, skipped {skipped}, failed {failed}, duplicates{" "}
        {duplicates}.
        {processingTime ? <> Processing time: {processingTime}.</> : null}
      </div>
      {skippedRows.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs">
          {skippedRows.slice(0, 5).map((item) => (
            <li key={`skipped-${item.row}-${item.reason}`}>
              Row {item.row}: {item.reason ?? "Skipped"}
            </li>
          ))}
        </ul>
      ) : null}
      {failedRows.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs">
          {failedRows.slice(0, 5).map((item) => (
            <li key={`failed-${item.row}-${item.error}`}>
              Row {item.row}: {item.error ?? "Failed"}
            </li>
          ))}
        </ul>
      ) : null}
    </GuidedImportSummary>
  );
}
