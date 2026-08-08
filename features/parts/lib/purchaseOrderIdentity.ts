export function purchaseOrderIdentity(input: {
  id: string;
  poNumber?: string | null;
  workOrderNumber?: string | null;
}): { primary: string; secondary: string } {
  const workOrderNumber = String(input.workOrderNumber ?? "").trim();
  const poNumber = String(input.poNumber ?? "").trim();

  return {
    primary: workOrderNumber || "Stock purchase",
    secondary:
      poNumber || `PO-${input.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
  };
}
