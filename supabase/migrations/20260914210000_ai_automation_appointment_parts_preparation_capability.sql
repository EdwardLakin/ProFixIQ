begin;

-- Phase 5 of the dashboard assistant plan (prepare_appointment_parts_request)
-- needs its own AI automation capability, distinct from the existing
-- "parts_ordering" one. parts_ordering is documented and understood as
-- "place authorized orders after fitment/availability/customer approval" -
-- a materially different, larger authority than creating a pre-approval
-- internal parts request. Reusing parts_ordering would silently redefine
-- what that capability's owner toggle, kill switch, and evidence/readiness
-- history mean. This migration only widens the two existing capability
-- CHECK constraints to also allow 'appointment_parts_preparation'; it does
-- not remove, rename, or change the meaning of any existing allowed value.

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
  );

alter table public.ai_automation_evidence
  drop constraint if exists ai_automation_evidence_capability_chk;
alter table public.ai_automation_evidence
  add constraint ai_automation_evidence_capability_chk check (
    capability in (
      'appointment_intake', 'customer_status_updates',
      'work_order_line_creation', 'quote_preparation',
      'approval_request_delivery', 'parts_ordering',
      'appointment_reminders', 'advisor_follow_up',
      'invoice_preparation', 'payment_collection',
      'appointment_parts_preparation'
    )
  );

commit;
