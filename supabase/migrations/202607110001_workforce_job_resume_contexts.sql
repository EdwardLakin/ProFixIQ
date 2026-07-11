-- Durable auto-resume context for job labor paused by break/lunch punches.
-- Additive and safe for existing data: no backfill is required because only new
-- break/lunch transitions write rows here.

begin;

create table if not exists public.workforce_job_resume_contexts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  break_punch_id uuid not null references public.punch_events(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  assignment_id uuid,
  paused_job_session_id uuid references public.work_order_line_labor_segments(id) on delete set null,
  pause_reason text not null check (pause_reason in ('break', 'lunch')),
  status text not null default 'pending' check (status in ('pending', 'resumed', 'cancelled', 'invalid')),
  paused_at timestamptz not null,
  resumed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wjrc_shop_user_status
  on public.workforce_job_resume_contexts (shop_id, user_id, status, paused_at desc);

create index if not exists idx_wjrc_line_status
  on public.workforce_job_resume_contexts (shop_id, work_order_line_id, status)
  where work_order_line_id is not null;

create unique index if not exists uq_wjrc_one_pending_per_break_punch
  on public.workforce_job_resume_contexts (break_punch_id)
  where status = 'pending';

alter table public.workforce_job_resume_contexts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workforce_job_resume_contexts' and policyname = 'wjrc_select_same_shop') then
    create policy "wjrc_select_same_shop"
      on public.workforce_job_resume_contexts
      for select
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.shop_id = workforce_job_resume_contexts.shop_id
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workforce_job_resume_contexts' and policyname = 'wjrc_insert_self_same_shop') then
    create policy "wjrc_insert_self_same_shop"
      on public.workforce_job_resume_contexts
      for insert
      to authenticated
      with check (
        user_id = auth.uid()
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.shop_id = workforce_job_resume_contexts.shop_id
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workforce_job_resume_contexts' and policyname = 'wjrc_update_self_same_shop') then
    create policy "wjrc_update_self_same_shop"
      on public.workforce_job_resume_contexts
      for update
      to authenticated
      using (
        user_id = auth.uid()
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.shop_id = workforce_job_resume_contexts.shop_id
        )
      )
      with check (
        user_id = auth.uid()
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.shop_id = workforce_job_resume_contexts.shop_id
        )
      );
  end if;
end $$;

commit;
