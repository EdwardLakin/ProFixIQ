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
  return supabase.rpc("insert_ai_event", {
    p_shop_id: params.shopId,
    p_event_type: params.type,
    p_payload: params.payload,
    p_entity_id: params.entityId ?? null,
    p_entity_table: params.entityTable ?? null,
    p_user_id: params.userId ?? null,
    p_training_source: params.trainingSource ?? null,
  });
}
