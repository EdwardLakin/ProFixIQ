export type IntegrationConnectionStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "degraded"
  | "error";

export type IntegrationDirection = "inbound" | "outbound";
export type IntegrationOperationStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "dead_lettered";

export type IntegrationConnection = {
  id: string;
  shopId: string;
  provider: string;
  displayName: string | null;
  status: IntegrationConnectionStatus;
  capabilities: string[];
  config: Record<string, unknown>;
  secretReference: string | null;
  syncCursor: Record<string, unknown>;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

export type ExternalObjectIdentity = {
  provider: string;
  objectType: string;
  externalId: string;
  canonicalTable: string;
  canonicalId: string;
  externalVersion?: string | null;
  metadata?: Record<string, unknown>;
};

export type IntegrationOperation = {
  provider: string;
  direction: IntegrationDirection;
  operation: string;
  operationKey: string;
  objectType?: string | null;
  externalId?: string | null;
  canonicalTable?: string | null;
  canonicalId?: string | null;
  status: IntegrationOperationStatus;
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
  errorMessage?: string | null;
};

export interface IntegrationAdapter<Health = Record<string, unknown>> {
  readonly provider: string;
  readonly capabilities: readonly string[];
  healthCheck(): Promise<Health>;
}

export class IntegrationRegistry<Adapter extends IntegrationAdapter> {
  private readonly adapters = new Map<string, Adapter>();

  register(adapter: Adapter): void {
    const key = adapter.provider.trim().toLowerCase();
    if (!key) throw new Error("Integration provider is required.");
    if (this.adapters.has(key)) {
      throw new Error(`Integration provider ${key} is already registered.`);
    }
    this.adapters.set(key, adapter);
  }

  unregister(provider: string): void {
    this.adapters.delete(provider.trim().toLowerCase());
  }

  get(provider: string): Adapter | null {
    return this.adapters.get(provider.trim().toLowerCase()) ?? null;
  }

  list(): Adapter[] {
    return [...this.adapters.values()];
  }
}
