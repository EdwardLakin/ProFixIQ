type QuantityInput = {
  quantityRequested: unknown;
  quantity: unknown;
  quantityReturned: unknown;
  quantityCancelled: unknown;
};

function finite(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveApprovedPartInvoiceQuantity(
  input: QuantityInput,
): number {
  const requested = finite(input.quantityRequested);
  const attached = requested > 0 ? requested : finite(input.quantity);
  return Math.max(
    0,
    attached -
      Math.max(0, finite(input.quantityReturned)) -
      Math.max(0, finite(input.quantityCancelled)),
  );
}
