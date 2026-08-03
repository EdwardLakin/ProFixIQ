-- Restore the Instant Shop Analysis persistence tables required before the
-- lead-kind migration. Public routes use service-role application handlers;
-- browsers receive no direct table privileges.

do $$
declare
  v_mode text;
  v_missing_tables text[];
  v_missing_columns text[];
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    select array_agg(required_table order by required_table)
      into v_missing_tables
    from unnest(array['demo_shop_boosts', 'demo_shop_boost_leads']::text[])
      as required(required_table)
    where to_regclass('public.' || required_table) is null;

    if coalesce(array_length(v_missing_tables, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: Instant Shop Analysis tables are missing: '
          || array_to_string(v_missing_tables, ', ');
    end if;

    select array_agg(table_name || '.' || required_column order by table_name, required_column)
      into v_missing_columns
    from (
      values
        ('demo_shop_boosts', 'id'),
        ('demo_shop_boosts', 'shop_id'),
        ('demo_shop_boosts', 'intake_id'),
        ('demo_shop_boosts', 'shop_name'),
        ('demo_shop_boosts', 'country'),
        ('demo_shop_boosts', 'snapshot'),
        ('demo_shop_boosts', 'has_unlocked'),
        ('demo_shop_boost_leads', 'id'),
        ('demo_shop_boost_leads', 'demo_id'),
        ('demo_shop_boost_leads', 'email'),
        ('demo_shop_boost_leads', 'summary'),
        ('demo_shop_boost_leads', 'share_count'),
        ('demo_shop_boost_leads', 'emails_sent'),
        ('demo_shop_boost_leads', 'last_viewed_at'),
        ('demo_shop_boost_leads', 'engagement_score')
    ) as required(table_name, required_column)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = required.table_name
        and c.column_name = required.required_column
    );

    if coalesce(array_length(v_missing_columns, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: Instant Shop Analysis columns are missing: '
          || array_to_string(v_missing_columns, ', ');
    end if;

    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

create table if not exists public.demo_shop_boosts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  intake_id uuid,
  shop_name text not null,
  country text not null default 'US' check (country in ('US', 'CA')),
  snapshot jsonb not null default '{}'::jsonb,
  has_unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_shop_boosts_shop_idx
  on public.demo_shop_boosts(shop_id, created_at desc)
  where shop_id is not null;
create index if not exists demo_shop_boosts_intake_idx
  on public.demo_shop_boosts(intake_id)
  where intake_id is not null;

create table if not exists public.demo_shop_boost_leads (
  id uuid primary key default gen_random_uuid(),
  demo_id uuid not null references public.demo_shop_boosts(id) on delete cascade,
  email text not null,
  summary text,
  share_count integer not null default 0 check (share_count >= 0),
  emails_sent integer not null default 0 check (emails_sent >= 0),
  last_viewed_at timestamptz,
  engagement_score numeric(6,2),
  created_at timestamptz not null default now()
);

create index if not exists demo_shop_boost_leads_demo_email_idx
  on public.demo_shop_boost_leads(demo_id, lower(email));
create index if not exists demo_shop_boost_leads_engagement_idx
  on public.demo_shop_boost_leads(demo_id, engagement_score desc, last_viewed_at desc);

alter table public.demo_shop_boosts enable row level security;
alter table public.demo_shop_boost_leads enable row level security;
revoke all on public.demo_shop_boosts, public.demo_shop_boost_leads from anon, authenticated;
grant all on public.demo_shop_boosts, public.demo_shop_boost_leads to service_role;
