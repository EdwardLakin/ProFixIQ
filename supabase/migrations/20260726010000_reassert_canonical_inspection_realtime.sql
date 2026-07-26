begin;

-- The canonical inspections row is the only live progress stream. Reassert
-- publication membership for environments whose Realtime publication drifted
-- during the legacy inspection_sessions cutover.
alter table public.inspections replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_publication p
    where p.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime'
      and pr.prrelid = 'public.inspections'::regclass
  ) then
    alter publication supabase_realtime add table public.inspections;
  end if;

  if exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime'
      and pr.prrelid = to_regclass('public.inspection_sessions')
  ) then
    alter publication supabase_realtime drop table public.inspection_sessions;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
