begin;

-- Feedback retries are keyed per reporter. The API already replays an existing
-- receipt before insert; this partial unique index closes the remaining race
-- where two requests with the same key pass that preflight concurrently.
-- Historical Agent rows without a feedback submission key are unaffected.
create unique index if not exists agent_requests_feedback_submission_key_uidx
  on public.agent_requests (
    reporter_id,
    ((normalized_json ->> 'submissionKey'))
  )
  where nullif(btrim(normalized_json ->> 'submissionKey'), '') is not null;

commit;
