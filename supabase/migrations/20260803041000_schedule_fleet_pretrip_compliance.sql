-- Keep fleet pre-trip compliance evaluation close to its authoritative data.
-- The scheduler runs as postgres; application roles still cannot execute the evaluator.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $schedule$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'fleet-pretrip-compliance-hourly'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'fleet-pretrip-compliance-hourly',
    '11 * * * *',
    $command$select public.evaluate_fleet_pretrip_compliance(clock_timestamp());$command$
  );
end;
$schedule$;
