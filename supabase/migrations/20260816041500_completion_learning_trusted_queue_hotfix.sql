-- Move completed-repair learning entirely behind a trusted durable queue.
-- Canonical job completion enqueues in the same transaction; a service-only
-- worker owns claims, retries, and finalization using the database clock.

begin;

alter table copilot.completed_repair_learning_receipts
  alter column actor_user_id drop not null;

alter table copilot.completed_repair_learning_receipts
  drop constraint if exists completed_repair_learning_receipts_actor_user_id_fkey;
alter table copilot.completed_repair_learning_receipts
  add constraint completed_repair_learning_receipts_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;

-- Canonical workforce keys include their caller-specific prefix and the
-- workforce receipt table intentionally stores text without an artificial
-- length cap. Mirror that contract here so copying a trusted receipt cannot
-- roll back completion or this migration.
alter table copilot.completed_repair_learning_receipts
  drop constraint if exists completed_repair_learning_operation_key_chk;
alter table copilot.completed_repair_learning_receipts
  add constraint completed_repair_learning_operation_key_chk
  check (nullif(btrim(operation_key), '') is not null);

alter table copilot.completed_repair_learning_receipts
  drop constraint if exists completed_repair_learning_state_chk;
alter table copilot.completed_repair_learning_receipts
  add constraint completed_repair_learning_state_chk
  check (state in ('running', 'retryable', 'completed', 'failed'));

-- The first implementation persisted the caller's raw idempotency key. Bind
-- those rows to the canonical durable finish receipt before trust is enforced.
update copilot.completed_repair_learning_receipts receipt
set operation_key = workforce.operation_key,
    updated_at = clock_timestamp()
from public.workforce_operation_keys workforce
where workforce.shop_id = receipt.shop_id
  and workforce.work_order_line_id = receipt.work_order_line_id
  and workforce.operation_name = 'job_punch:finish'
  and workforce.actor_user_id is not distinct from receipt.actor_user_id
  and workforce.operation_key in (
    receipt.operation_key,
    'technician-copilot:' || receipt.operation_key,
    receipt.shop_id::text || ':job-punch:' || receipt.operation_key
  );

-- A browser-created receipt without the canonical finish receipt is not a
-- valid queue item and must not suppress later repair learning.
delete from copilot.completed_repair_learning_receipts receipt
where not exists (
  select 1
  from public.workforce_operation_keys workforce
  where workforce.shop_id = receipt.shop_id
    and workforce.work_order_line_id = receipt.work_order_line_id
    and workforce.operation_name = 'job_punch:finish'
    and workforce.operation_key = receipt.operation_key
    and workforce.actor_user_id is not distinct from receipt.actor_user_id
);

create or replace function copilot.enqueue_completed_repair_learning()
returns trigger
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_source_line_updated_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if new.operation_name <> 'job_punch:finish'
    or new.work_order_line_id is null
  then
    return new;
  end if;

  select coalesce(line.updated_at, v_now)
    into v_source_line_updated_at
  from public.work_order_lines line
  where line.id = new.work_order_line_id
    and line.shop_id = new.shop_id;

  if not found then
    return new;
  end if;

  insert into copilot.completed_repair_learning_receipts as current_receipt (
    shop_id,
    work_order_line_id,
    actor_user_id,
    operation_key,
    source_line_updated_at,
    state,
    lease_token,
    lease_expires_at,
    attempt_count,
    result,
    completed_at,
    updated_at
  ) values (
    new.shop_id,
    new.work_order_line_id,
    new.actor_user_id,
    new.operation_key,
    v_source_line_updated_at,
    'retryable',
    null,
    null,
    1,
    jsonb_build_object('queued', true),
    null,
    v_now
  )
  on conflict (shop_id, work_order_line_id) do update
  set actor_user_id = excluded.actor_user_id,
      operation_key = excluded.operation_key,
      source_line_updated_at = excluded.source_line_updated_at,
      state = 'retryable',
      lease_token = null,
      lease_expires_at = v_now,
      attempt_count = 1,
      result = jsonb_build_object('queued', true),
      completed_at = null,
      updated_at = v_now
  where excluded.source_line_updated_at > current_receipt.source_line_updated_at
    or excluded.operation_key is distinct from current_receipt.operation_key;

  return new;
end;
$$;

revoke all on function copilot.enqueue_completed_repair_learning()
  from public, anon, authenticated, service_role;

drop trigger if exists enqueue_completed_repair_learning
  on public.workforce_operation_keys;
create trigger enqueue_completed_repair_learning
after insert on public.workforce_operation_keys
for each row
when (new.operation_name = 'job_punch:finish')
execute function copilot.enqueue_completed_repair_learning();

-- A replay of an already-committed finish receipt does not insert another
-- workforce row, so the insert trigger cannot recover historical completions
-- whose old post-commit learning call failed before creating its receipt.
-- Keep this owner-only helper as a deterministic manual recovery path and run
-- it once during the upgrade.
create or replace function copilot.backfill_completed_repair_learning_queue()
returns integer
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  with trusted_finish as (
    select distinct on (workforce.shop_id, workforce.work_order_line_id)
      workforce.shop_id,
      workforce.work_order_line_id,
      workforce.actor_user_id,
      workforce.operation_key,
      coalesce(line.updated_at, workforce.created_at, clock_timestamp())
        as source_line_updated_at
    from public.workforce_operation_keys workforce
    join public.work_order_lines line
      on line.id = workforce.work_order_line_id
     and line.shop_id = workforce.shop_id
     and lower(coalesce(line.status::text, '')) in ('completed', 'invoiced')
    where workforce.operation_name = 'job_punch:finish'
      and workforce.work_order_line_id is not null
      and nullif(btrim(workforce.operation_key), '') is not null
    order by
      workforce.shop_id,
      workforce.work_order_line_id,
      workforce.created_at desc,
      workforce.id desc
  )
  insert into copilot.completed_repair_learning_receipts (
    shop_id,
    work_order_line_id,
    actor_user_id,
    operation_key,
    source_line_updated_at,
    state,
    lease_token,
    lease_expires_at,
    attempt_count,
    result,
    completed_at,
    updated_at
  )
  select
    finish.shop_id,
    finish.work_order_line_id,
    finish.actor_user_id,
    finish.operation_key,
    finish.source_line_updated_at,
    'retryable',
    null,
    clock_timestamp(),
    1,
    jsonb_build_object('queued', true, 'backfilled', true),
    null,
    clock_timestamp()
  from trusted_finish finish
  on conflict (shop_id, work_order_line_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function copilot.backfill_completed_repair_learning_queue()
  from public, anon, authenticated, service_role;

select copilot.backfill_completed_repair_learning_queue();

create or replace function public.claim_completed_repair_learning_batch(
  p_worker_id uuid,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  shop_id uuid,
  work_order_line_id uuid,
  actor_user_id uuid,
  lease_token uuid
)
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_lease_seconds integer := greatest(
    30,
    least(coalesce(p_lease_seconds, 120), 600)
  );
begin
  if p_worker_id is null then
    raise exception 'completed_repair_learning_worker_required'
      using errcode = '22023';
  end if;

  return query
  with candidates as (
    select receipt.shop_id, receipt.work_order_line_id, line.updated_at
    from copilot.completed_repair_learning_receipts receipt
    join public.work_order_lines line
      on line.id = receipt.work_order_line_id
     and line.shop_id = receipt.shop_id
     and lower(coalesce(line.status::text, '')) in ('completed', 'invoiced')
    where (
      (
        receipt.state = 'retryable'
        and (
          receipt.lease_expires_at is null
          or receipt.lease_expires_at <= v_now
        )
      )
      or (
        receipt.state = 'running'
        and (
          receipt.lease_expires_at is null
          or receipt.lease_expires_at <= v_now
        )
      )
    )
    and exists (
      select 1
      from public.workforce_operation_keys workforce
      where workforce.shop_id = receipt.shop_id
        and workforce.work_order_line_id = receipt.work_order_line_id
        and workforce.operation_name = 'job_punch:finish'
        and workforce.operation_key = receipt.operation_key
        and workforce.actor_user_id
          is not distinct from receipt.actor_user_id
    )
    order by receipt.updated_at, receipt.work_order_line_id
    for update of receipt skip locked
    limit v_limit
  )
  update copilot.completed_repair_learning_receipts receipt
  set state = 'running',
      source_line_updated_at = coalesce(candidates.updated_at, v_now),
      lease_token = gen_random_uuid(),
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      attempt_count = receipt.attempt_count + 1,
      result = jsonb_build_object('workerId', p_worker_id),
      completed_at = null,
      updated_at = v_now
  from candidates
  where receipt.shop_id = candidates.shop_id
    and receipt.work_order_line_id = candidates.work_order_line_id
  returning
    receipt.shop_id,
    receipt.work_order_line_id,
    receipt.actor_user_id,
    receipt.lease_token;
end;
$$;

create or replace function public.finish_completed_repair_learning_worker(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_receipt copilot.completed_repair_learning_receipts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_terminal_failure boolean := false;
  v_next_attempt_at timestamptz;
  v_result jsonb := case
    when jsonb_typeof(p_result) = 'object'
      and octet_length(p_result::text) <= 16384
    then p_result
    else '{}'::jsonb
  end;
begin
  if p_shop_id is null
    or p_work_order_line_id is null
    or p_lease_token is null
    or p_succeeded is null
  then
    raise exception 'completed_repair_learning_finish_invalid'
      using errcode = '22023';
  end if;

  select receipt.*
    into v_receipt
  from copilot.completed_repair_learning_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.work_order_line_id = p_work_order_line_id
  for update;

  if not found then
    raise exception 'completed_repair_learning_receipt_not_found'
      using errcode = 'P0001';
  end if;
  if v_receipt.state = 'completed' then
    return jsonb_build_object('completed', true, 'replayed', true);
  end if;
  if v_receipt.actor_user_id is distinct from p_actor_user_id
    or v_receipt.lease_token is distinct from p_lease_token
  then
    raise exception 'completed_repair_learning_lease_conflict'
      using errcode = '23505';
  end if;
  if not exists (
    select 1
    from public.workforce_operation_keys workforce
    where workforce.shop_id = v_receipt.shop_id
      and workforce.work_order_line_id = v_receipt.work_order_line_id
      and workforce.operation_name = 'job_punch:finish'
      and workforce.operation_key = v_receipt.operation_key
      and workforce.actor_user_id is not distinct from v_receipt.actor_user_id
  ) then
    raise exception 'completed_repair_learning_finish_receipt_required'
      using errcode = '42501';
  end if;

  if not p_succeeded then
    v_terminal_failure := v_receipt.attempt_count >= 6;
    if not v_terminal_failure then
      v_next_attempt_at := v_now + make_interval(
        secs => least(
          3600.0::double precision,
          60.0::double precision * power(
            2.0::double precision,
            greatest(0, least(v_receipt.attempt_count - 2, 6))::double precision
          )
        )
      );
    end if;
  end if;

  update copilot.completed_repair_learning_receipts receipt
  set state = case
        when p_succeeded then 'completed'
        when v_terminal_failure then 'failed'
        else 'retryable'
      end,
      lease_token = null,
      lease_expires_at = v_next_attempt_at,
      result = v_result || jsonb_build_object(
        'terminal', v_terminal_failure,
        'attemptCount', v_receipt.attempt_count,
        'nextAttemptAt', v_next_attempt_at
      ),
      completed_at = case when p_succeeded then v_now else null end,
      updated_at = v_now
  where receipt.shop_id = p_shop_id
    and receipt.work_order_line_id = p_work_order_line_id;

  return jsonb_build_object(
    'completed', p_succeeded,
    'retryable', not p_succeeded and not v_terminal_failure,
    'failed', v_terminal_failure,
    'nextAttemptAt', v_next_attempt_at,
    'replayed', false
  );
end;
$$;

drop index if exists copilot.completed_repair_learning_receipts_queue_idx;
create index completed_repair_learning_receipts_queue_idx
  on copilot.completed_repair_learning_receipts (
    state,
    lease_expires_at,
    updated_at
  )
  where state in ('retryable', 'running');

-- Retire the browser-callable lease API. All queue ownership now flows through
-- the service-only batch and worker finalizer above.
revoke all on function public.claim_completed_repair_learning_atomic(
  uuid,uuid,uuid,text,uuid,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.finish_completed_repair_learning_atomic(
  uuid,uuid,uuid,uuid,boolean,jsonb,timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.claim_completed_repair_learning_batch(
  uuid,integer,integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_completed_repair_learning_batch(
  uuid,integer,integer
) to service_role;

revoke all on function public.finish_completed_repair_learning_worker(
  uuid,uuid,uuid,uuid,boolean,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.finish_completed_repair_learning_worker(
  uuid,uuid,uuid,uuid,boolean,jsonb
) to service_role;

comment on function public.claim_completed_repair_learning_batch(
  uuid,integer,integer
) is
  'Service-only claim of canonical completed-repair learning receipts using the database clock.';
comment on function public.finish_completed_repair_learning_worker(
  uuid,uuid,uuid,uuid,boolean,jsonb
) is
  'Service-only finalization of an owned completed-repair learning lease.';
comment on function copilot.backfill_completed_repair_learning_queue() is
  'Owner-only recovery of missing learning queue rows from canonical finish receipts.';

do $completion_learning_trusted_queue_postcheck$
begin
  if has_function_privilege(
      'authenticated',
      'public.claim_completed_repair_learning_atomic(uuid,uuid,uuid,text,uuid,timestamp with time zone)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.finish_completed_repair_learning_atomic(uuid,uuid,uuid,uuid,boolean,jsonb,timestamp with time zone)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.claim_completed_repair_learning_batch(uuid,integer,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.finish_completed_repair_learning_worker(uuid,uuid,uuid,uuid,boolean,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'copilot.backfill_completed_repair_learning_queue()',
      'EXECUTE'
    )
  then
    raise exception 'Completion learning postcheck failed: browser role can own worker receipts';
  end if;

  if has_function_privilege(
      'service_role',
      'public.claim_completed_repair_learning_atomic(uuid,uuid,uuid,text,uuid,timestamp with time zone)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.finish_completed_repair_learning_atomic(uuid,uuid,uuid,uuid,boolean,jsonb,timestamp with time zone)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.claim_completed_repair_learning_batch(uuid,integer,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.finish_completed_repair_learning_worker(uuid,uuid,uuid,uuid,boolean,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'copilot.backfill_completed_repair_learning_queue()',
      'EXECUTE'
    )
  then
    raise exception 'Completion learning postcheck failed: trusted worker privileges are incoherent';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname =
      'completed_repair_learning_receipts_actor_user_id_fkey'
      and constraint_row.confdeltype = 'n'
  ) then
    raise exception 'Completion learning postcheck failed: actor deletion is blocked';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgname = 'enqueue_completed_repair_learning'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Completion learning postcheck failed: finish enqueue trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'completed_repair_learning_state_chk'
      and constraint_row.conrelid =
        'copilot.completed_repair_learning_receipts'::regclass
      and position('failed' in pg_get_constraintdef(constraint_row.oid)) > 0
  ) then
    raise exception 'Completion learning postcheck failed: terminal state is missing';
  end if;
end;
$completion_learning_trusted_queue_postcheck$;

commit;
