-- Technician CoPilot V2 phase 4: add an explicit Realtime voice rollout flag
-- without broadening the existing AI automation capability vocabulary.

begin;

alter table public.ai_automation_capability_settings
  drop constraint if exists ai_automation_capability_settings_capability_chk;

alter table public.ai_automation_capability_settings
  add constraint ai_automation_capability_settings_capability_chk check (
    capability in (
      'appointment_intake',
      'customer_status_updates',
      'work_order_line_creation',
      'quote_preparation',
      'approval_request_delivery',
      'parts_ordering',
      'appointment_reminders',
      'advisor_follow_up',
      'invoice_preparation',
      'payment_collection',
      'technician_copilot_text',
      'technician_copilot_documentation',
      'technician_copilot_voice'
    )
    or capability ~ '^technician_copilot_(text|documentation|voice):[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
  );

comment on constraint ai_automation_capability_settings_capability_chk
  on public.ai_automation_capability_settings is
  'Allows the certified AI automation capabilities plus exact Technician CoPilot text, documentation, and voice shop flags with UUID-scoped technician overrides.';

do $technician_copilot_voice_capability_postcheck$
declare
  v_definition text;
begin
  select pg_get_constraintdef(c.oid)
    into v_definition
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'ai_automation_capability_settings'
    and c.conname = 'ai_automation_capability_settings_capability_chk';

  if v_definition is null then
    raise exception 'Technician CoPilot voice capability postcheck failed: capability constraint missing';
  end if;

  if position('appointment_intake' in v_definition) = 0
    or position('payment_collection' in v_definition) = 0
  then
    raise exception 'Technician CoPilot voice capability postcheck failed: legacy capability vocabulary changed';
  end if;

  if position('technician_copilot_text' in v_definition) = 0
    or position('technician_copilot_documentation' in v_definition) = 0
    or position('technician_copilot_voice' in v_definition) = 0
  then
    raise exception 'Technician CoPilot voice capability postcheck failed: rollout flags missing';
  end if;

  if position('technician_copilot_(text|documentation|voice)' in v_definition) = 0
    or position('[0-9A-Fa-f]{8}' in v_definition) = 0
    or position('[0-9A-Fa-f]{12}' in v_definition) = 0
  then
    raise exception 'Technician CoPilot voice capability postcheck failed: technician override scope is not UUID constrained';
  end if;
end
$technician_copilot_voice_capability_postcheck$;

commit;
