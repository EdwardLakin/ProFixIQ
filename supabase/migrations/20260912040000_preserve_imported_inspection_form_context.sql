-- Preserve the non-checklist half of an imported inspection form.
--
-- The importer classified the trip/vehicle header, the regulatory declaration,
-- the free-text defect boxes and the completion/certification blocks, and then
-- discarded all of them when it built the runnable template. That reduced a
-- commercial trip-inspection report (for example the City of Calgary X 505) to
-- a bare checklist, with no unit number, odometer, date, location, or driver
-- and mechanic sign-off.
--
-- inspection_templates.form_context stores those preserved blocks beside the
-- runnable sections so an imported template can be run and reported as the
-- customer's actual form.

alter table public.inspection_templates
  add column if not exists form_context jsonb;

comment on column public.inspection_templates.form_context is
  'Preserved non-checklist blocks of an imported customer form: header, notices, notes, completion, branding. Null for templates that were not imported.';

-- The signature is unchanged, so instances still running the previous release
-- keep approving successfully through a rolling deploy. The preserved context
-- is read from the import job's own reviewed summary rather than accepted from
-- the caller, which keeps the reviewed import the single source of truth and
-- leaves the client unable to attach context the reviewer never saw.
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
  v_form_context jsonb;
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

  v_form_context := case
    when jsonb_typeof(coalesce(v_job.summary, '{}'::jsonb) -> 'formContext') = 'object'
      then v_job.summary -> 'formContext'
    else '{}'::jsonb
  end;

  insert into public.inspection_templates (
    user_id,
    shop_id,
    template_name,
    sections,
    form_context,
    description,
    tags,
    vehicle_type,
    is_public
  ) values (
    auth.uid(),
    v_job.shop_id,
    v_title,
    p_sections,
    v_form_context,
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
  'Idempotently creates the canonical inspection template for a completed, current-shop inspection-form import, carrying the reviewed form''s preserved header, notice, note and completion blocks onto the template.';
