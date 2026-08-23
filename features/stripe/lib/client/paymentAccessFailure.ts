export type PaymentAccessFailure =
  | "owner_pin"
  | "authentication"
  | "authorization"
  | null;

export function resolvePaymentAccessFailure(
  status: number,
  error: unknown,
): PaymentAccessFailure {
  const message = String(error ?? "")
    .trim()
    .toLowerCase();
  if (
    (status === 401 || status === 403) &&
    (message === "owner pin required" ||
      message === "owner pin purpose not allowed")
  ) {
    return "owner_pin";
  }
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  return null;
}
