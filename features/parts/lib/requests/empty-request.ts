export type EmptyPartRequestCandidate = {
  status: unknown;
  itemCount: number;
};

/**
 * Empty request cards are safe to dismiss only before pricing or physical
 * parts activity begins. Keeping this rule shared prevents the card UI from
 * offering cancellation for partially built or operational requests.
 */
export function isDismissibleEmptyPartRequestBucket(
  requests: readonly EmptyPartRequestCandidate[],
): boolean {
  return (
    requests.length > 0 &&
    requests.every(
      (request) =>
        String(request.status ?? "").toLowerCase() === "requested" &&
        request.itemCount === 0,
    )
  );
}
