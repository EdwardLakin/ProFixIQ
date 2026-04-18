import { createAdminClient } from "./createAdminClient";
import type { ProFixIQStoryEvent } from "../types";

function buildOpportunityTitle(event: ProFixIQStoryEvent) {
  return (
    event.storyData.headline?.trim() ||
    event.storyData.summary?.trim() ||
    `${event.eventType.replace(/\./g, " ")} opportunity`
  );
}

function buildOpportunityAngle(event: ProFixIQStoryEvent) {
  const serviceLabel = event.storyData.services?.[0]?.label?.trim();
  const findingLabel = event.storyData.findings?.[0]?.label?.trim();

  return serviceLabel || findingLabel || null;
}

export async function persistShopReelLifecycleSource(event: ProFixIQStoryEvent) {
  const supabase = createAdminClient() as unknown as {
    from: (table: string) => ReturnType<ReturnType<typeof createAdminClient>["from"]>
  };

  const { data: source, error: sourceError } = await supabase
    .from("shopreel_story_sources")
    .upsert(
      {
        shop_id: event.source.shopId,
        event_key: event.eventId,
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        payload: event,
        ingest_status: "ingested",
        ingested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_id,event_key" },
    )
    .select("id, occurred_at")
    .single();

  if (sourceError || !source?.id) {
    throw sourceError ?? new Error("Failed to persist ShopReel story source.");
  }

  const { error: opportunityError } = await supabase
    .from("shopreel_opportunities")
    .upsert(
      {
        shop_id: event.source.shopId,
        story_source_id: source.id,
        title: buildOpportunityTitle(event),
        angle: buildOpportunityAngle(event),
        summary: event.storyData.summary ?? null,
        event_type: event.eventType,
        source_occurred_at: source.occurred_at,
        first_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "story_source_id", ignoreDuplicates: true },
    );

  if (opportunityError) {
    throw opportunityError;
  }
}
