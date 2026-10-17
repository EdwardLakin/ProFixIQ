begin;

-- Recovery knows the actor and operation key before it can resolve the issuing
-- shop. Match the error-receipt predicate without changing the success index.
create index if not exists idx_ai_usage_inspection_actor_error_event
  on private.ai_usage_ledger (user_id, event_key)
  where provider = 'openai'
    and feature = 'openai_realtime_token'
    and endpoint = '/api/openai/inspection-transcription-token'
    and modality = 'realtime'
    and status = 'error';

commit;
