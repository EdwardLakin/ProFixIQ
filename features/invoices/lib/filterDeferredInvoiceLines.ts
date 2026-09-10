export function filterDeferredInvoiceLines<
  T extends { status?: string | null },
>(lines: T[]): Array<Omit<T, "status">> {
  return lines
    .filter(
      (line) =>
        String(line.status ?? "")
          .trim()
          .toLowerCase() !== "deferred",
    )
    .map(({ status: _status, ...line }) => line);
}
