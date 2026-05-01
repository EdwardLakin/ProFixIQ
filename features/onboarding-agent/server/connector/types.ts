import { z } from "zod";

export const connectorCapabilitiesSchema = z.object({
  canWriteCustomers: z.boolean(),
  canWriteVehicles: z.boolean(),
  canWriteCustomerVehicleLinks: z.boolean(),
  canWriteVendors: z.boolean(),
  canWriteParts: z.boolean(),
  canWriteHistoricalWork: z.boolean(),
  canWriteInvoiceHistory: z.boolean(),
  canCreateRecommendations: z.boolean(),
  canSubmitSummary: z.boolean(),
  dryRunOnly: z.boolean(),
});

export type ConnectorCapabilities = z.infer<typeof connectorCapabilitiesSchema>;

export const validateShopBodySchema = z.object({
  shopId: z.string().uuid(),
  expectedShopId: z.string().uuid(),
});

export const connectorActionBodySchema = z.object({
  shopId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type ConnectorActionBody = z.infer<typeof connectorActionBodySchema>;

export const connectorResponseSchema = z.object({
  ok: z.boolean(),
  externalId: z.string().optional(),
  status: z.enum(["dry_run", "skipped", "succeeded", "failed"]),
  message: z.string().optional(),
});

export type ConnectorResponse = z.infer<typeof connectorResponseSchema>;

export const CONNECTOR_CAPABILITIES: ConnectorCapabilities = {
  canWriteCustomers: true,
  canWriteVehicles: true,
  canWriteCustomerVehicleLinks: true,
  canWriteVendors: false,
  canWriteParts: false,
  canWriteHistoricalWork: false,
  canWriteInvoiceHistory: false,
  canCreateRecommendations: false,
  canSubmitSummary: false,
  dryRunOnly: false,
};
