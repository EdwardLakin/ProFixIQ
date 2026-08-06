begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- The 17 columns below are bootstrap-era aliases that are absent from the
-- production contract and unused by current application code. Preserve any
-- meaningful legacy values in the canonical columns or metadata before
-- retiring them from clean replay.

alter table public.demo_shop_boosts
  drop column if exists updated_at;

do $email_logs$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_logs'
      and column_name = 'email'
  ) then
    execute $sql$
      update public.email_logs
      set to_email = coalesce(to_email, email)
      where email is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_logs'
      and column_name = 'error'
  ) then
    execute $sql$
      update public.email_logs
      set error_text = coalesce(error_text, error)
      where error is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_logs'
      and column_name = 'event_type'
  ) then
    execute $sql$
      update public.email_logs
      set last_event_type = coalesce(last_event_type, event_type)
      where event_type is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_logs'
      and column_name = 'timestamp'
  ) then
    execute $sql$
      update public.email_logs
      set last_event_at = coalesce(last_event_at, "timestamp")
      where "timestamp" is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_logs'
      and column_name = 'sg_event_id'
  ) then
    execute $sql$
      update public.email_logs
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('legacy_sg_event_id', sg_event_id)
      where sg_event_id is not null
    $sql$;
  end if;
end;
$email_logs$;

drop index if exists public.idx_email_logs_email;
drop index if exists public.idx_email_logs_event_type;

alter table public.email_logs
  drop column if exists email,
  drop column if exists error,
  drop column if exists event_type,
  drop column if exists sg_event_id,
  drop column if exists "timestamp";

-- Production uses profile IDs and the natural Fleet membership key. Convert a
-- clean bootstrap only when its synthetic id column proves that the legacy
-- table shape is present.
do $fleet_members$
declare
  v_constraint record;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fleet_members'
      and column_name = 'id'
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.fleet_members fm
    join public.profiles p
      on p.shop_id = fm.shop_id
     and p.user_id = fm.user_id
     and p.id <> fm.user_id
    join public.fleet_members existing
      on existing.fleet_id = fm.fleet_id
     and existing.user_id = p.id
     and existing.id <> fm.id
  ) then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: Fleet member identity conversion would create duplicates';
  end if;

  update public.fleet_members fm
  set user_id = p.id
  from public.profiles p
  where p.shop_id = fm.shop_id
    and p.user_id = fm.user_id
    and p.id <> fm.user_id;

  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.fleet_members'::regclass
      and c.contype = 'f'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = c.conrelid
            and a.attname = 'user_id'
            and not a.attisdropped
        )
      ]::smallint[]
  loop
    execute format(
      'alter table public.fleet_members drop constraint %I',
      v_constraint.conname
    );
  end loop;

  alter table public.fleet_members
    drop constraint if exists fleet_members_pkey,
    drop constraint if exists fleet_members_user_id_fleet_id_key,
    drop column if exists id;

  alter table public.fleet_members
    add constraint fleet_members_pkey primary key (fleet_id, user_id),
    add constraint fleet_members_user_fk
      foreign key (user_id) references public.profiles(id)
      on delete cascade not valid;

  alter table public.fleet_members
    validate constraint fleet_members_user_fk;
end;
$fleet_members$;

do $invoice_due$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices'
      and column_name = 'due_at'
  ) then
    execute $sql$
      update public.invoices
      set due_date = coalesce(due_date, (due_at at time zone 'UTC')::date)
      where due_at is not null
    $sql$;
  end if;
end;
$invoice_due$;

alter table public.invoices
  drop column if exists due_at;

do $message_chat$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages'
      and column_name = 'chat_id'
  ) then
    execute $sql$
      update public.messages
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('legacy_chat_id', chat_id)
      where chat_id is not null
    $sql$;
  end if;
end;
$message_chat$;

drop index if exists public.idx_messages_chat_id;
drop index if exists public.messages_chat_id_idx;

drop function if exists public.chat_post_message(uuid[], text, uuid);

alter table public.messages
  drop column if exists chat_id;

do $payments$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'invoice_id'
  ) then
    execute $sql$
      update public.payments p
      set metadata = coalesce(p.metadata, '{}'::jsonb)
        || jsonb_build_object('legacy_invoice_id', p.invoice_id)
      where p.invoice_id is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'payment_method'
  ) then
    execute $sql$
      update public.payments
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('legacy_payment_method', payment_method)
      where payment_method is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'processor'
  ) then
    execute $sql$
      update public.payments
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('legacy_processor', processor)
      where processor is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'processor_payment_id'
  ) then
    execute $sql$
      update public.payments
      set metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'legacy_processor_payment_id',
              processor_payment_id
            )
      where processor_payment_id is not null
    $sql$;
  end if;
end;
$payments$;

drop index if exists public.payments_shop_invoice_idx;

alter table public.payments
  drop column if exists invoice_id,
  drop column if exists payment_method,
  drop column if exists processor,
  drop column if exists processor_payment_id;

-- Production's canonical columns are voided_reason/voided_note. Patch the
-- atomic function definition before removing the duplicate bootstrap aliases.
do $work_order_line_void$
declare
  v_signature regprocedure := to_regprocedure(
    'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)'
  );
  v_sql text;
begin
  if v_signature is null then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: parts_void_work_order_line_atomic is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_sql;

  if position('voided_reason = trim(p_reason)' in v_sql) = 0 then
    if position('void_reason = trim(p_reason)' in v_sql) = 0 then
      raise exception using errcode = 'P0001',
        message = 'MIGRATION_RECONCILIATION_FAILED: void reason patch point is missing';
    end if;
    v_sql := replace(
      v_sql,
      'void_reason = trim(p_reason)',
      'voided_reason = trim(p_reason)'
    );
  end if;

  if position('voided_note = nullif(trim(p_note)' in v_sql) = 0 then
    if position('void_note = nullif(trim(p_note)' in v_sql) = 0 then
      raise exception using errcode = 'P0001',
        message = 'MIGRATION_RECONCILIATION_FAILED: void note patch point is missing';
    end if;
    v_sql := replace(
      v_sql,
      'void_note = nullif(trim(p_note)',
      'voided_note = nullif(trim(p_note)'
    );
  end if;

  execute v_sql;
end;
$work_order_line_void$;

do $work_order_line_values$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_order_lines'
      and column_name = 'void_reason'
  ) then
    execute $sql$
      update public.work_order_lines
      set voided_reason = coalesce(voided_reason, void_reason)
      where void_reason is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_order_lines'
      and column_name = 'void_note'
  ) then
    execute $sql$
      update public.work_order_lines
      set voided_note = coalesce(voided_note, void_note)
      where void_note is not null
    $sql$;
  end if;
end;
$work_order_line_values$;

alter table public.work_order_lines
  drop column if exists void_note,
  drop column if exists void_reason;

do $quote_line_anchors$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_order_quote_lines'
      and column_name = 'inspection_item_id'
  ) then
    execute $sql$
      update public.work_order_quote_lines
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'legacy_inspection_item_id',
          inspection_item_id
        )
      where inspection_item_id is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_order_quote_lines'
      and column_name = 'menu_item_id'
  ) then
    execute $sql$
      update public.work_order_quote_lines
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('legacy_menu_item_id', menu_item_id)
      where menu_item_id is not null
    $sql$;
  end if;
end;
$quote_line_anchors$;

alter table public.work_order_quote_lines
  drop column if exists inspection_item_id,
  drop column if exists menu_item_id;

-- These required functions are overloaded in production. Supabase typegen may
-- omit an overload, so verify PostgreSQL directly instead of treating a type
-- export omission as a missing function.
do $required_functions$
begin
  if to_regprocedure('public.can_update_part_request_items(uuid)') is null then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: can_update_part_request_items(uuid) is missing';
  end if;

  if to_regprocedure(
    'public.receive_part_request_item(uuid,uuid,numeric,uuid,text)'
  ) is null then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: receive_part_request_item(uuid,uuid,numeric,uuid,text) is missing';
  end if;
end;
$required_functions$;

commit;
