type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};

type RpcResult = {
  data: unknown;
  error: RpcError | null;
};

type RpcInvoker = (
  functionName: string,
  args: Record<string, unknown>,
) => PromiseLike<RpcResult>;

type RpcClient = {
  rpc: unknown;
};

export async function setStockOnHandSnapshot(args: {
  client: RpcClient;
  shopId: string;
  partId: string;
  locationId: string;
  targetQty: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  if (!Number.isFinite(args.targetQty) || args.targetQty < 0) {
    throw new Error("Inventory snapshot quantity must be zero or greater.");
  }

  const rpc = args.client.rpc as RpcInvoker;
  const { data, error } = await rpc.call(
    args.client,
    "parts_set_stock_on_hand_snapshot",
    {
      p_shop_id: args.shopId,
      p_part_id: args.partId,
      p_location_id: args.locationId,
      p_target_qty: args.targetQty,
      p_idempotency_key: args.idempotencyKey,
      p_metadata: args.metadata ?? {},
    },
  );

  if (error) {
    throw new Error(
      [error.message, error.details, error.hint].filter(Boolean).join(" "),
    );
  }

  return (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
}
