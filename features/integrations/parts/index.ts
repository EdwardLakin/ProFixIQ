/**
 * Parts Integration Layer
 * Wrapper for PartsTech / WorldPac / NAPA inputs.
 */

export interface PartsSearchInput {
  vin?: string;
  keywords?: string;
}

export interface PartResult {
  id: string;
  supplier: string;
  description: string;
  price: number;
  stock: number;
}

export interface PartsProvider {
  search(input: PartsSearchInput): Promise<PartResult[]>;
}

class MockPartsProvider implements PartsProvider {
  async search(input: PartsSearchInput): Promise<PartResult[]> {
    return [
      {
        id: "demo-123",
        supplier: "MockSupplier",
        description: `Example part for ${input.keywords ?? input.vin}`,
        price: 42,
        stock: 3,
      },
    ];
  }
}

export const Parts = new MockPartsProvider();
