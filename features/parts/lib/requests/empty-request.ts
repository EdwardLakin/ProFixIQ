export type EmptyPartRequestCandidate = {
  status: unknown;
  itemCount: number;
};

export const DISMISSIBLE_EMPTY_PART_REQUEST_STATUSES = [
  "requested",
  "quoted",
  "approved",
] as const;

const dismissibleEmptyStatuses = new Set<string>(
  DISMISSIBLE_EMPTY_PART_REQUEST_STATUSES,
);

export function isDismissibleEmptyPartRequestStatus(
  status: unknown,
): boolean {
  return dismissibleEmptyStatuses.has(
    String(status ?? "")
      .trim()
      .toLowerCase(),
  );
}

/**
 * A request can be dismissed when it has no parts and has not reached a
 * physical parts state. Requested, quoted, and approved parents are all
 * pre-operational when they contain no item rows.
 */
export function isDismissibleEmptyPartRequestBucket(
  requests: readonly EmptyPartRequestCandidate[],
): boolean {
  return (
    requests.length > 0 &&
    requests.every(
      (request) =>
        request.itemCount === 0 &&
        isDismissibleEmptyPartRequestStatus(request.status),
    )
  );
}
