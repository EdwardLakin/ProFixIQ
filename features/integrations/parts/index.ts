/**
 * Provider-neutral parts integration contract.
 *
 * Provider catalog identifiers are external identities only. Every selected
 * result must resolve to one canonical ProFixIQ parts.id before it can be
 * ordered, received, stocked, used on a work order, or invoiced.
 */

import {
  IntegrationRegistry,
  type IntegrationAdapter,
} from "@/features/integrations/core/contracts";

export type PartsProviderCapability =
  | "search"
  | "availability"
  | "quotes"
  | "orders"
  | "order_status"
  | "cancellations"
  | "supersessions"
  | "fitment";

export interface PartsSearchInput {
  vin?: string;
  vehicleId?: string;
  keywords?: string;
  partNumber?: string;
  postalCode?: string;
  supplierIds?: string[];
}

export interface ExternalPartIdentity {
  provider: string;
  externalId: string;
  supplierId?: string | null;
  supplierSku?: string | null;
  manufacturer?: string | null;
  partNumber?: string | null;
  barcode?: string | null;
  unitOfMeasure?: string | null;
  packageQuantity?: number | null;
  metadata?: Record<string, unknown>;
}

export interface PartResult {
  id: string;
  provider: string;
  externalId: string;
  supplier: string;
  supplierId?: string | null;
  description: string;
  manufacturer?: string | null;
  partNumber?: string | null;
  supplierSku?: string | null;
  barcode?: string | null;
  price: number;
  listPrice?: number | null;
  coreCharge?: number | null;
  stock: number;
  eta?: string | null;
  identity: ExternalPartIdentity;
}

export interface PartsQuoteLine {
  externalPartId: string;
  supplierId?: string | null;
  quantity: number;
}

export interface PartsQuote {
  provider: string;
  quoteId: string;
  expiresAt?: string | null;
  lines: Array<
    PartsQuoteLine & {
      unitCost: number;
      availability?: number | null;
      metadata?: Record<string, unknown>;
    }
  >;
}

export interface PartsOrderResult {
  provider: string;
  externalOrderId: string;
  status: string;
  submittedAt: string;
  metadata?: Record<string, unknown>;
}

export interface PartsProvider extends IntegrationAdapter {
  readonly provider: string;
  readonly capabilities: readonly PartsProviderCapability[];
  search(input: PartsSearchInput): Promise<PartResult[]>;
  quote?(lines: PartsQuoteLine[]): Promise<PartsQuote>;
  submitOrder?(input: {
    quoteId?: string | null;
    purchaseOrderNumber: string;
    shipTo?: Record<string, unknown>;
    lines: PartsQuoteLine[];
    idempotencyKey: string;
  }): Promise<PartsOrderResult>;
  getOrderStatus?(externalOrderId: string): Promise<PartsOrderResult>;
  cancelOrder?(externalOrderId: string, idempotencyKey: string): Promise<void>;
}

class PartsProviderRegistry extends IntegrationRegistry<PartsProvider> {
  async search(
    input: PartsSearchInput,
    providers?: string[],
  ): Promise<PartResult[]> {
    const requested = providers?.length
      ? providers
          .map((provider) => this.get(provider))
          .filter((provider): provider is PartsProvider => Boolean(provider))
      : this.list();

    const settled = await Promise.allSettled(
      requested
        .filter((provider) => provider.capabilities.includes("search"))
        .map((provider) => provider.search(input)),
    );
    return settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
  }
}

/**
 * Runtime adapters (Nexpart, PartsTech, etc.) register here only after their
 * server-side connection is configured. An empty registry returns no fake
 * catalog results; the manual canonical-part workflow remains available.
 */
export const Parts = new PartsProviderRegistry();
