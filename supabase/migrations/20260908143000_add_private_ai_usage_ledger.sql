begin;

create schema if not exists private authorization postgres;

create table private.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  shop_id uuid references public.shops(id) on delete set null,
  -- Existing AI routes use a mix of auth user ids and profile ids for actor
  -- attribution, so keep the durable actor identifier without an FK while the
  -- write RPC validates that it resolves to the supplied shop when both exist.
  user_id uuid,
  feature text not null,
  endpoint text not null,
  provider text not null default 'openai',
  model text,
  modality text not null default 'text'
    check (modality in ('text', 'realtime', 'speech', 'image', 'other')),
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

create index ai_usage_ledger_shop_month_idx
  on private.ai_usage_ledger (shop_id, occurred_at desc);
create index ai_usage_ledger_user_month_idx
  on private.ai_usage_ledger (shop_id, user_id, occurred_at desc);
create index ai_usage_ledger_feature_month_idx
  on private.ai_usage_ledger (shop_id, feature, occurred_at desc);
create index ai_usage_ledger_model_month_idx
  on private.ai_usage_ledger (model, occurred_at desc);
create index ai_usage_ledger_quota_receipt_idx
  on private.ai_usage_ledger (quota_receipt_id)
  where quota_receipt_id is not null;

revoke all privileges on table private.ai_usage_ledger
  from public, anon, authenticated, service_role;

create or replace function public.record_ai_usage_ledger(
  p_event_key text,
  p_shop_id uuid,
  p_user_id uuid,
  p_feature text,
  p_endpoint text,
  p_provider text,
  p_model text,
  p_modality text,
  p_prompt_tokens integer,
  p_cached_prompt_tokens integer,
  p_completion_tokens integer,
  p_total_tokens integer,
  p_audio_input_tokens integer,
  p_audio_output_tokens integer,
  p_speech_characters integer,
  p_duration_seconds numeric,
  p_estimated_cost_usd numeric,
  p_latency_ms integer,
  p_status text,
  p_error_code text,
  p_error_message text,
  p_provider_request_id text,
  p_quota_receipt_id uuid,
  p_occurred_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_id uuid;
begin
  if nullif(btrim(p_event_key), '') is null
     or length(p_event_key) > 240
     or nullif(btrim(p_feature), '') is null
     or length(p_feature) > 120
     or nullif(btrim(p_endpoint), '') is null
     or length(p_endpoint) > 240
     or nullif(btrim(p_provider), '') is null
     or length(p_provider) > 80
     or coalesce(nullif(btrim(p_modality), ''), 'text') not in ('text', 'realtime', 'speech', 'image', 'other')
     or p_status not in ('success', 'error')
     or coalesce(p_latency_ms, 0) < 0
     or coalesce(p_prompt_tokens, 0) < 0
     or coalesce(p_cached_prompt_tokens, 0) < 0
     or coalesce(p_completion_tokens, 0) < 0
     or coalesce(p_total_tokens, 0) < 0
     or coalesce(p_audio_input_tokens, 0) < 0
     or coalesce(p_audio_output_tokens, 0) < 0
     or coalesce(p_speech_characters, 0) < 0
     or coalesce(p_duration_seconds, 0) < 0
     or coalesce(p_estimated_cost_usd, 0) < 0 then
    raise exception using
      errcode = '22023',
      message = 'AI_USAGE_LEDGER_INPUT_INVALID';
  end if;

  if p_shop_id is not null
     and not exists (select 1 from public.shops shop where shop.id = p_shop_id) then
    raise exception using
      errcode = '42501',
      message = 'AI_USAGE_LEDGER_SHOP_SCOPE_INVALID';
  end if;

  if p_user_id is not null and p_shop_id is not null
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = p_shop_id
         and (profile.id = p_user_id or profile.user_id = p_user_id)
     ) then
    raise exception using
      errcode = '42501',
      message = 'AI_USAGE_LEDGER_USER_SCOPE_INVALID';
  end if;

  insert into private.ai_usage_ledger (
    event_key,
    shop_id,
    user_id,
    feature,
    endpoint,
    provider,
    model,
    modality,
    prompt_tokens,
    cached_prompt_tokens,
    completion_tokens,
    total_tokens,
    audio_input_tokens,
    audio_output_tokens,
    speech_characters,
    duration_seconds,
    estimated_cost_usd,
    latency_ms,
    status,
    error_code,
    error_message,
    provider_request_id,
    quota_receipt_id,
    occurred_at
  ) values (
    btrim(p_event_key),
    p_shop_id,
    p_user_id,
    btrim(p_feature),
    btrim(p_endpoint),
    btrim(p_provider),
    nullif(btrim(p_model), ''),
    coalesce(nullif(btrim(p_modality), ''), 'text'),
    p_prompt_tokens,
    p_cached_prompt_tokens,
    p_completion_tokens,
    p_total_tokens,
    p_audio_input_tokens,
    p_audio_output_tokens,
    p_speech_characters,
    p_duration_seconds,
    p_estimated_cost_usd,
    coalesce(p_latency_ms, 0),
    p_status,
    nullif(btrim(p_error_code), ''),
    left(nullif(btrim(p_error_message), ''), 500),
    nullif(btrim(p_provider_request_id), ''),
    p_quota_receipt_id,
    coalesce(p_occurred_at, clock_timestamp())
  )
  on conflict (event_key) do nothing
  returning id into v_id;

  if v_id is null then
    select ledger.id
      into v_id
    from private.ai_usage_ledger ledger
    where ledger.event_key = btrim(p_event_key);
  end if;

  return v_id;
end
$function$;

alter function public.record_ai_usage_ledger(
  text, uuid, uuid, text, text, text, text, text,
  integer, integer, integer, integer, integer, integer, integer,
  numeric, numeric, integer, text, text, text, text, uuid, timestamptz
) owner to postgres;

revoke all privileges on function public.record_ai_usage_ledger(
  text, uuid, uuid, text, text, text, text, text,
  integer, integer, integer, integer, integer, integer, integer,
  numeric, numeric, integer, text, text, text, text, uuid, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.record_ai_usage_ledger(
  text, uuid, uuid, text, text, text, text, text,
  integer, integer, integer, integer, integer, integer, integer,
  numeric, numeric, integer, text, text, text, text, uuid, timestamptz
) to service_role;

commit;
