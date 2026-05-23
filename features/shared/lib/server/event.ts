export async function insertEvent(
  supabase: any,
  params: {
    shopId: string;
    type: string;
    payload: any;
    entityId?: string;
    entityTable?: string;
    userId?: string;
    trainingSource?: string;
  }
) {
  const rpcPayload = {
    p_shop_id: params.shopId,
    p_event_type: params.type,
    p_payload: params.payload,
    p_entity_id: params.entityId ?? null,
    p_entity_table: params.entityTable ?? null,
    p_user_id: params.userId ?? null,
    p_training_source: params.trainingSource ?? null,
  };

  const rpcResult = await supabase.rpc("insert_ai_event", rpcPayload);
  if (!rpcResult?.error) return rpcResult;

  const code = String(rpcResult.error?.code ?? "");
  const message = String(rpcResult.error?.message ?? "").toLowerCase();
  const missingRpc = code === "PGRST202" || code === "42883" || message.includes("insert_ai_event") || message.includes("could not find");

  if (!missingRpc) return rpcResult;

  const fallbackPayload = {
    shop_id: params.shopId,
    event_type: params.type,
    payload: params.payload ?? {},
    entity_id: params.entityId ?? null,
    entity_table: params.entityTable ?? null,
    user_id: params.userId ?? null,
    training_source: params.trainingSource ?? null,
  };

  const fallback = await supabase.from("ai_events").insert(fallbackPayload).select("id").maybeSingle();
  return { data: fallback.data?.id ? { event_id: fallback.data.id } : null, error: fallback.error };
}
