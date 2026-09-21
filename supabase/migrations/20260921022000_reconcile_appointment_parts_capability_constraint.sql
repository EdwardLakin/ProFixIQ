begin;

-- Reconcile the appointment-parts automation capability after the production
-- execution preserved technician-copilot capability values that the canonical
-- 20260914210000 migration did not carry forward. This migration is forward-only
-- and restores the complete allowed settings domain while retaining the new
-- appointment_parts_preparation capability.
alter table public.ai_automation_capability_settings
  drop constraint if exists ai_automation_capability_settings_capability_chk;

alter table public.ai_automation_capability_settings
  add constraint ai_automation_capability_settings_capability_chk check (
    capability in (
      'appointment_intake', 'customer_status_updates',
      'work_order_line_creation', 'quote_preparation',
      'approval_request_delivery', 'parts_ordering',
      'appointment_reminders', 'advisor_follow_up',
      'invoice_preparation', 'payment_collection',
      'appointment_parts_preparation'
    )
    or capability in (
      'technician_copilot_text', 'technician_copilot_documentation',
      'technician_copilot_voice'
    )
    or capability ~ '^technician_copilot_(text|documentation|voice):[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
  );


commit;
