create table if not exists public.ai_suggestion_feedback (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid null references public.work_order_lines(id) on delete set null,
  suggestion_id text null,
  title text not null,
  labor_hours numeric null,
  parts jsonb not null default '[]'::jsonb,
  accepted boolean not null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_suggestion_feedback_shop_id_idx
  on public.ai_suggestion_feedback(shop_id);

create index if not exists ai_suggestion_feedback_work_order_id_idx
  on public.ai_suggestion_feedback(work_order_id);

create index if not exists ai_suggestion_feedback_line_id_idx
  on public.ai_suggestion_feedback(work_order_line_id);

create index if not exists ai_suggestion_feedback_accepted_idx
  on public.ai_suggestion_feedback(accepted);

alter table public.ai_suggestion_feedback enable row level security;

drop policy if exists "ai_suggestion_feedback_select" on public.ai_suggestion_feedback;
create policy "ai_suggestion_feedback_select"
on public.ai_suggestion_feedback
for select
using (is_shop_member(shop_id));

drop policy if exists "ai_suggestion_feedback_insert" on public.ai_suggestion_feedback;
create policy "ai_suggestion_feedback_insert"
on public.ai_suggestion_feedback
for insert
with check (is_shop_member(shop_id));

drop policy if exists "ai_suggestion_feedback_update" on public.ai_suggestion_feedback;
create policy "ai_suggestion_feedback_update"
on public.ai_suggestion_feedback
for update
using (is_shop_member(shop_id))
with check (is_shop_member(shop_id));
