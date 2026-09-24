begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Performance advisor flagged demo_access_requests_reviewed_by_fkey as an
-- uncovered foreign key: without this index, resolving "which requests did
-- this operator review" (or the reviewed_by = null cascade when a profile
-- is deleted) requires a full table scan.
create index if not exists demo_access_requests_reviewed_by_idx
  on public.demo_access_requests (reviewed_by);

commit;
