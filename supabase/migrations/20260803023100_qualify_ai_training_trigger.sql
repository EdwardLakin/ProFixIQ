-- The fleet AI event trigger inherits an empty search_path from its caller.
-- Fully qualify the training table so defective pre-trips cannot be rolled back by name resolution.
create or replace function public.ai_generate_training_row()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  insert into public.ai_training_data(shop_id, source_event_id, content)
  values(new.shop_id, new.id, new.payload::text);
  return new;
end;
$function$;

revoke execute on function public.ai_generate_training_row() from public, anon, authenticated;
