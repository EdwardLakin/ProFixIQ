begin;

create schema if not exists private authorization postgres;

create table private.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  shop_id uuid references public.shops(id) on delete set null,
  user_id uuid,
  feature text not null,
  endpoint text not null,
  provider text not null default 'openai',
  model text,
  modality text not null default 'text'
    check (modality in ('text', 'realtime', 'speech', 'image', 'other')),
  rate_card_version text not null,
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  cached_prompt_tokens integer check (cached_prompt_tokens is null or cached_prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens is null or completion_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  audio_input_tokens integer check (audio_input_tokens is null or audio_input_tokens >= 0),
  audio_output_tokens integer check (audio_output_tokens is null or audio_output_tokens >= 0),
  speech_characters integer check (speech_characters is null or speech_characters >= 0),
  duration_seconds numeric(12, 3) check (duration_seconds is null or duration_seconds >= 0),
  estimated_cost_usd numeric(14, 8)
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  status text not null check (status in ('success', 'error')),
  error_code text,
  error_message text,
  provider_request_id text,
  quota_receipt_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create index ai_usage_ledger_shop_month_idx on private.ai_usage_ledger (shop_id, occurred_at desc);
create index ai_usage_ledger_user_month_idx on private.ai_usage_ledger (shop_id, user_id, occurred_at desc);
create index ai_usage_ledger_feature_month_idx on private.ai_usage_ledger (shop_id, feature, occurred_at desc);
create index ai_usage_ledger_model_month_idx on private.ai_usage_ledger (model, occurred_at desc);
create index ai_usage_ledger_quota_receipt_idx on private.ai_usage_ledger (quota_receipt_id)
  where quota_receipt_id is not null;
create unique index ai_usage_ledger_provider_request_unique_idx
  on private.ai_usage_ledger (provider, provider_request_id, feature)
  where provider_request_id is not null;

revoke all privileges on schema private from public, anon, authenticated;
revoke all privileges on table private.ai_usage_ledger from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert on table private.ai_usage_ledger to service_role;

-- Keep the existing public.insert_ai_event signature so the generated public
-- Supabase contract does not change. Normal callers retain the existing
-- ai_events behavior. A reserved training_source gives server-side service-role
-- telemetry one narrow path into the private ledger without exposing a second
-- privileged RPC to authenticated clients.
create or replace function public.insert_ai_event(
  p_shop_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_entity_id uuid default null::uuid,
  p_entity_table text default null::text,
  p_user_id uuid default null::uuid,
  p_training_source text default null::text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $function$
declare
  v_event_id uuid;
  v_event_key text;
  v_feature text;
  v_endpoint text;
  v_provider text;
  v_model text;
  v_modality text;
  v_rate_card_version text;
  v_prompt_tokens integer;
  v_cached_prompt_tokens integer;
  v_completion_tokens integer;
  v_total_tokens integer;
  v_audio_input_tokens integer;
  v_audio_output_tokens integer;
  v_speech_characters integer;
  v_duration_seconds numeric;
  v_estimated_cost_usd numeric;
  v_latency_ms integer;
  v_status text;
  v_error_code text;
  v_error_message text;
  v_provider_request_id text;
  v_quota_receipt_id uuid;
  v_occurred_at timestamptz;
begin
  if p_training_source = '__durable_ai_usage_ledger__' then
    if current_user <> 'service_role' then
      raise exception using errcode = '42501', message = 'AI_USAGE_LEDGER_SERVICE_ROLE_REQUIRED';
    end if;

    v_event_key := nullif(btrim(p_payload ->> 'event_key'), '');
    v_feature := nullif(btrim(p_payload ->> 'feature'), '');
    v_endpoint := nullif(btrim(p_payload ->> 'endpoint'), '');
    v_provider := coalesce(nullif(btrim(p_payload ->> 'provider'), ''), 'openai');
    v_model := nullif(btrim(p_payload ->> 'model'), '');
    v_modality := coalesce(nullif(btrim(p_payload ->> 'modality'), ''), 'text');
    v_rate_card_version := nullif(btrim(p_payload ->> 'rate_card_version'), '');
    v_prompt_tokens := nullif(p_payload ->> 'prompt_tokens', '')::integer;
    v_cached_prompt_tokens := nullif(p_payload ->> 'cached_prompt_tokens', '')::integer;
    v_completion_tokens := nullif(p_payload ->> 'completion_tokens', '')::integer;
    v_total_tokens := nullif(p_payload ->> 'total_tokens', '')::integer;
    v_audio_input_tokens := nullif(p_payload ->> 'audio_input_tokens', '')::integer;
    v_audio_output_tokens := nullif(p_payload ->> 'audio_output_tokens', '')::integer;
    v_speech_characters := nullif(p_payload ->> 'speech_characters', '')::integer;
    v_duration_seconds := nullif(p_payload ->> 'duration_seconds', '')::numeric;
    v_estimated_cost_usd := nullif(p_payload ->> 'estimated_cost_usd', '')::numeric;
    v_latency_ms := coalesce(nullif(p_payload ->> 'latency_ms', '')::integer, 0);
    v_status := nullif(btrim(p_payload ->> 'status'), '');
    v_error_code := nullif(btrim(p_payload ->> 'error_code'), '');
    v_error_message := nullif(btrim(p_payload ->> 'error_message'), '');
    v_provider_request_id := nullif(btrim(p_payload ->> 'provider_request_id'), '');
    v_quota_receipt_id := nullif(p_payload ->> 'quota_receipt_id', '')::uuid;
    v_occurred_at := coalesce(
      nullif(p_payload ->> 'occurred_at', '')::timestamptz,
      clock_timestamp()
    );

    if v_event_key is null
       or length(v_event_key) > 240
       or v_feature is null
       or length(v_feature) > 120
       or v_endpoint is null
       or length(v_endpoint) > 240
       or v_provider <> 'openai'
       or v_rate_card_version is null
       or length(v_rate_card_version) > 80
       or v_modality not in ('text', 'realtime', 'speech', 'image', 'other')
       or v_status not in ('success', 'error')
       or v_latency_ms < 0
       or coalesce(v_prompt_tokens, 0) < 0
       or coalesce(v_cached_prompt_tokens, 0) < 0
       or coalesce(v_completion_tokens, 0) < 0
       or coalesce(v_total_tokens, 0) < 0
       or coalesce(v_audio_input_tokens, 0) < 0
       or coalesce(v_audio_output_tokens, 0) < 0
       or coalesce(v_speech_characters, 0) < 0
       or coalesce(v_duration_seconds, 0) < 0
       or coalesce(v_estimated_cost_usd, 0) < 0 then
      raise exception using errcode = '22023', message = 'AI_USAGE_LEDGER_INPUT_INVALID';
    end if;

    if p_shop_id is not null
       and not exists (select 1 from public.shops shop where shop.id = p_shop_id) then
      raise exception using errcode = '42501', message = 'AI_USAGE_LEDGER_SHOP_SCOPE_INVALID';
    end if;

    if p_user_id is not null and p_shop_id is not null
       and not exists (
         select 1 from public.profiles profile
         where profile.shop_id = p_shop_id
           and (profile.id = p_user_id or profile.user_id = p_user_id)
       ) then
      raise exception using errcode = '42501', message = 'AI_USAGE_LEDGER_USER_SCOPE_INVALID';
    end if;

    insert into private.ai_usage_ledger (
      event_key, shop_id, user_id, feature, endpoint, provider, model, modality,
      rate_card_version, prompt_tokens, cached_prompt_tokens, completion_tokens,
      total_tokens, audio_input_tokens, audio_output_tokens, speech_characters,
      duration_seconds, estimated_cost_usd, latency_ms, status, error_code,
      error_message, provider_request_id, quota_receipt_id, occurred_at
    ) values (
      v_event_key, p_shop_id, p_user_id, v_feature, v_endpoint, v_provider,
      v_model, v_modality, v_rate_card_version, v_prompt_tokens,
      v_cached_prompt_tokens, v_completion_tokens, v_total_tokens,
      v_audio_input_tokens, v_audio_output_tokens, v_speech_characters,
      v_duration_seconds, v_estimated_cost_usd, v_latency_ms, v_status,
      v_error_code, left(v_error_message, 500), v_provider_request_id,
      v_quota_receipt_id, v_occurred_at
    )
    on conflict do nothing
    returning id into v_event_id;

    if v_event_id is null then
      select ledger.id into v_event_id
      from private.ai_usage_ledger ledger
      where ledger.event_key = v_event_key
         or (
           v_provider_request_id is not null
           and ledger.provider = v_provider
           and ledger.provider_request_id = v_provider_request_id
           and ledger.feature = v_feature
         )
      order by ledger.created_at asc
      limit 1;
    end if;

    return v_event_id;
  end if;

  insert into public.ai_events (
    shop_id,
    event_type,
    payload,
    entity_id,
    entity_table,
    user_id,
    training_source
  )
  values (
    p_shop_id,
    p_event_type,
    p_payload,
    p_entity_id,
    p_entity_table,
    p_user_id,
    p_training_source::public.ai_training_source
  )
  returning id into v_event_id;

  return v_event_id;
end
$function$;

-- Preserve the established execution surface for normal ai_events callers.
revoke all on function public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text)
  from public, anon;
grant execute on function public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text)
  to authenticated, service_role;

commit;