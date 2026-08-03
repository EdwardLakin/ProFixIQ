-- Fleet AI events run inside a caller with an empty search_path.
-- Qualify ShopReel relations so the optional content pipeline cannot abort operational writes.
create or replace function public.process_ai_event_for_shopreel()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_story_source_id uuid;
  v_event_type text;
begin
  v_event_type := new.event_type;
  if v_event_type like 'training.%' then return new; end if;

  insert into public.shopreel_story_sources (
    shop_id,source_type,source_id,title,description,metadata,created_at
  )
  values (
    new.shop_id,'ai_event',new.id,v_event_type,
    coalesce(new.payload->>'summary',v_event_type),new.payload,now()
  )
  on conflict do nothing
  returning id into v_story_source_id;

  if v_story_source_id is null then
    select s.id into v_story_source_id
    from public.shopreel_story_sources s
    where s.source_type='ai_event' and s.source_id=new.id
    limit 1;
  end if;

  insert into public.shopreel_content_opportunities (
    shop_id,story_source_id,status,score,reason,created_at
  )
  values (
    new.shop_id,v_story_source_id,'ready',
    case
      when v_event_type='inspection.completed' then 90
      when v_event_type='workorder.completed' then 95
      when v_event_type='quote.suggested' then 75
      else 60
    end,
    'Auto-generated from AI event: '||v_event_type,now()
  )
  on conflict (shop_id,story_source_id) do nothing;

  return new;
end;
$function$;

revoke execute on function public.process_ai_event_for_shopreel() from public, anon, authenticated;
