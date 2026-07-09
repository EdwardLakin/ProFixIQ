import { GuidedImportSummary } from "./GuidedImportSummary";

type SampleRow = {
  row: number;
  reason?: string;
  error?: string;
  customerName?: string | null;
  businessName?: string | null;
  email?: string | null;
  phone?: string | null;
  matchedBy?: string | null;
  matchedValue?: string | null;
  detectedExternalId?: string | null;
  detectedCustomerId?: string | null;
  detectedCustomerNumber?: string | null;
  matchedExistingExternalId?: string | null;
  matchedExistingCustomerId?: string | null;
};

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
  const describeRow = (item: SampleRow) =>
    [
      item.customerName ? `customer: ${item.customerName}` : null,
      item.businessName ? `business: ${item.businessName}` : null,
      item.email ? `email: ${item.email}` : null,
      item.phone ? `phone: ${item.phone}` : null,
      item.detectedExternalId
        ? `external_id: ${item.detectedExternalId}`
        : null,
      item.detectedCustomerId
        ? `customer_id: ${item.detectedCustomerId}`
        : null,
      item.detectedCustomerNumber
        ? `customer_number: ${item.detectedCustomerNumber}`
        : null,
      item.matchedBy ? `matched_by: ${item.matchedBy}` : null,
      item.matchedExistingExternalId
        ? `matched_existing_external_id: ${item.matchedExistingExternalId}`
        : null,
      item.matchedExistingCustomerId
        ? `matched_existing_customer_id: ${item.matchedExistingCustomerId}`
        : null,
      item.matchedValue ? `matched_value: ${item.matchedValue}` : null,
    ]
      .filter(Boolean)
      .join("; ");

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
              {describeRow(item) ? ` (${describeRow(item)})` : null}
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
