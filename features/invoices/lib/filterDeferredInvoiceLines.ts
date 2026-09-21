export function filterDeferredInvoiceLines<
  T extends { status?: string | null; line_status?: string | null },
>(lines: T[]): Array<Omit<T, "status" | "line_status">> {
  return lines
    .filter((line) => {
      const status = String(line.status ?? "")
        .trim()
        .toLowerCase();
      const lineStatus = String(line.line_status ?? "")
        .trim()
        .toLowerCase();
      return status !== "deferred" && lineStatus !== "deferred";
    })
    .map(({ status: _status, line_status: _lineStatus, ...line }) => line);
}
