alter table public.learned_job_templates
  drop constraint if exists learned_job_templates_shop_id_template_key_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learned_job_templates_shop_id_template_key_key'
  ) then
    alter table public.learned_job_templates
      add constraint learned_job_templates_shop_id_template_key_key
      unique (shop_id, template_key);
  end if;
end $$;
