-- Reassert the durable inspection-form import schema for environments where
-- the application deploy reached production before the original migration.

alter table public.import_jobs
  drop constraint if exists import_jobs_import_type_check;

alter table public.import_jobs
  add constraint import_jobs_import_type_check
  check (import_type in ('vehicle_history', 'invoices', 'inspection_form'));

alter table public.import_job_rows
  drop constraint if exists import_job_rows_status_check;

alter table public.import_job_rows
  add constraint import_job_rows_status_check
  check (status in ('queued', 'processing', 'imported', 'skipped', 'failed'));

alter table public.import_jobs
  add column if not exists result_record_id uuid,
  add column if not exists approved_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_jobs_result_inspection_template_fkey'
      and conrelid = 'public.import_jobs'::regclass
  ) then
    alter table public.import_jobs
      add constraint import_jobs_result_inspection_template_fkey
      foreign key (result_record_id)
      references public.inspection_templates(id)
      on delete set null;
  end if;
end
$$;

create index if not exists import_jobs_inspection_form_recent_idx
  on public.import_jobs(shop_id, created_at desc)
  where import_type = 'inspection_form';

create or replace function public.approve_inspection_form_import(
  p_job_id uuid,
  p_title text,
  p_sections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.import_jobs%rowtype;
  v_template_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_actor_shop_id uuid;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select shop_id, lower(btrim(coalesce(role, '')))
  into v_actor_shop_id, v_actor_role
  from public.profiles
  where id = auth.uid();

  if v_actor_shop_id is null
     or v_actor_shop_id <> public.current_shop_id()
     or v_actor_role not in ('owner', 'admin', 'manager', 'advisor', 'service') then
    raise exception 'Not authorized to approve inspection form imports';
  end if;

  select *
  into v_job
  from public.import_jobs
  where id = p_job_id
    and shop_id = public.current_shop_id()
    and import_type = 'inspection_form'
  for update;

  if not found then
    raise exception 'Inspection form import not found';
  end if;

  if v_job.result_record_id is not null then
    return v_job.result_record_id;
  end if;

  if v_job.status <> 'completed' then
    raise exception 'Inspection form import is not ready for approval';
  end if;

  if v_title is null then
    raise exception 'Template title is required';
  end if;

  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'At least one inspection section is required';
  end if;

  insert into public.inspection_templates (
    user_id,
    shop_id,
    template_name,
    sections,
    description,
    tags,
    vehicle_type,
    is_public
  ) values (
    auth.uid(),
    v_job.shop_id,
    v_title,
    p_sections,
    'Imported from a customer inspection form',
    array['imported', 'customer-form'],
    nullif(v_job.summary ->> 'vehicleType', ''),
    false
  )
  returning id into v_template_id;

  update public.import_jobs
  set result_record_id = v_template_id,
      approved_at = now(),
      summary = jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(summary, '{}'::jsonb), '{state}', '"approved"'::jsonb, true),
          '{title}',
          to_jsonb(v_title),
          true
        ),
        '{draftSections}',
        p_sections,
        true
      )
  where id = v_job.id;

  return v_template_id;
end;
$$;

revoke all on function public.approve_inspection_form_import(uuid, text, jsonb) from public;
grant execute on function public.approve_inspection_form_import(uuid, text, jsonb) to authenticated;

comment on function public.approve_inspection_form_import(uuid, text, jsonb) is
  'Idempotently creates the canonical inspection template for a completed, current-shop inspection-form import.';
