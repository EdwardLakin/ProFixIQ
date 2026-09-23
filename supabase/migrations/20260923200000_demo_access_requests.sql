begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Intake queue for the public "Request Demo Access" landing-page form.
-- Deliberately separate from profiles/shop_members: a request here is not
-- yet an account -- nothing is provisioned until an ops operator approves
-- it from /ops/demo-access, which then reuses the existing
-- createDemoProspect() flow in features/ops/server/demoAccess.ts.
--
-- No RLS policies are added: this table has no anon/authenticated grants
-- at all, so PostgREST denies every client-side request against it by
-- default (row_security enabled, zero policies = deny-all for RLS-subject
-- roles). Both the public submission endpoint and the ops approval queue
-- read/write this table exclusively through the server-only admin
-- (service-role) Supabase client, which bypasses RLS -- the same pattern
-- already used throughout features/ops/server/demoAccess.ts.

create table public.demo_access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  company_name text,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint demo_access_requests_status_chk
    check (status in ('pending', 'provisioning', 'approved', 'dismissed'))
);

create index demo_access_requests_status_created_idx
  on public.demo_access_requests (status, created_at desc);

create index demo_access_requests_email_created_idx
  on public.demo_access_requests (email, created_at desc);

-- Closes a race between the app-level cooldown pre-check and the insert:
-- concurrent submissions for the same email can both pass the pre-check
-- before either insert commits. At most one pending request per email can
-- exist at the database level; a second concurrent submit fails this
-- constraint and the app treats that failure the same as a cooldown skip.
create unique index demo_access_requests_pending_email_uidx
  on public.demo_access_requests (lower(email))
  where status = 'pending';

alter table public.demo_access_requests enable row level security;

commit;
