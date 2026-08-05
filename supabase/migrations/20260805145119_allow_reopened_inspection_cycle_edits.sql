-- Historical signatures belong to an immutable signing cycle. An authorized
-- reopen increments inspections.signing_cycle, so evidence from an earlier
-- cycle must not prevent edits to the newly opened draft.
create or replace function public.prevent_finalized_inspection_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $inspection_evidence_guard$
declare
  v_has_signature_for_cycle boolean := false;
  v_internal_transition boolean :=
    current_setting('profixiq.inspection_sign', true) = 'on'
    or current_setting('profixiq.inspection_reopen', true) = 'on';
begin
  if v_internal_transition then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select exists (
    select 1
    from public.inspection_signatures s
    where s.inspection_id = old.id
      and s.signing_cycle = coalesce(old.signing_cycle, 0)
  ) into v_has_signature_for_cycle;

  if coalesce(old.locked, false)
     or coalesce(old.completed, false)
     or not coalesce(old.is_draft, true)
     or old.finalized_at is not null
     or old.finalized_by is not null
     or lower(coalesce(old.status, 'draft')) in ('completed', 'finalized', 'signed')
     or v_has_signature_for_cycle then
    raise exception using
      errcode = 'P0001',
      message = 'Finalized inspection evidence is immutable; use the authorized reopen operation.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$inspection_evidence_guard$;

revoke all on function public.prevent_finalized_inspection_mutation() from public;
