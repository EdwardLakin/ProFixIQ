begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c', 'approval-primary@runtime.invalid', '{}'::jsonb),
  ('d79c01c9-46a2-4ab9-a695-2f86bd60fce8', 'approval-other@runtime.invalid', '{}'::jsonb);

insert into public.agent_requests (id, description)
values ('e2ccfa72-fd03-497b-b9c7-f14f101f49bc', 'Approval proof runtime contract');

insert into public.agent_human_approval_intents (
  request_id,
  engineering_case_id,
  mission_id,
  approval_kind,
  approver_user_id,
  token_sha256,
  expires_at,
  created_at
)
values
  (
    'e2ccfa72-fd03-497b-b9c7-f14f101f49bc',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3',
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    repeat('1', 64),
    now() + interval '3 minutes',
    now()
  ),
  (
    'e2ccfa72-fd03-497b-b9c7-f14f101f49bc',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3',
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    repeat('2', 64),
    now() + interval '3 minutes',
    now()
  ),
  (
    'e2ccfa72-fd03-497b-b9c7-f14f101f49bc',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3',
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    repeat('3', 64),
    now() - interval '1 minute',
    now() - interval '4 minutes'
  );

set local role service_role;

do $proof_contract$
declare
  consumed boolean;
begin
  select public.consume_agent_human_approval_intent(
    repeat('1', 64),
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3'
  ) into consumed;
  if consumed is not true then
    raise exception 'First approval-proof consumption must succeed';
  end if;

  select public.consume_agent_human_approval_intent(
    repeat('1', 64),
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3'
  ) into consumed;
  if consumed is not false then
    raise exception 'Approval-proof replay must fail';
  end if;

  select public.consume_agent_human_approval_intent(
    repeat('2', 64),
    'mission',
    'd79c01c9-46a2-4ab9-a695-2f86bd60fce8',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3'
  ) into consumed;
  if consumed is not false then
    raise exception 'Approval proof must be bound to the approver';
  end if;

  select public.consume_agent_human_approval_intent(
    repeat('2', 64),
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    'd62dfbd3-f692-43d5-8808-330470119e25',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3'
  ) into consumed;
  if consumed is not false then
    raise exception 'Approval proof must be bound to the engineering case';
  end if;

  select public.consume_agent_human_approval_intent(
    repeat('2', 64),
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '8eb8cc5e-4fc1-445e-a36f-c967e76811c5'
  ) into consumed;
  if consumed is not false then
    raise exception 'Approval proof must be bound to the mission';
  end if;

  select public.consume_agent_human_approval_intent(
    repeat('2', 64),
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3'
  ) into consumed;
  if consumed is not true then
    raise exception 'Mismatched attempts must not consume the valid proof';
  end if;

  select public.consume_agent_human_approval_intent(
    repeat('3', 64),
    'mission',
    'cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c',
    'a2d023e1-704b-4069-bada-5635fcbcf4f4',
    '694f5648-c5db-4b73-82a9-fc10e40c93e3'
  ) into consumed;
  if consumed is not false then
    raise exception 'Expired approval proof must fail';
  end if;
end;
$proof_contract$;

rollback;
