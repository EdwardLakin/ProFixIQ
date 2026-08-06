begin;

create index if not exists fleet_pretrip_reports_template_assignment_idx
  on public.fleet_pretrip_reports (template_assignment_id)
  where template_assignment_id is not null;

create index if not exists fleet_pretrip_reports_trailer_idx
  on public.fleet_pretrip_reports (trailer_vehicle_id)
  where trailer_vehicle_id is not null;

commit;
