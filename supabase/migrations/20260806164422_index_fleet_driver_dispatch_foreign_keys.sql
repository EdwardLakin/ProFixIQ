begin;

create index if not exists fleet_pretrip_template_shop_idx
  on public.fleet_pretrip_template_assignments (shop_id);
create index if not exists fleet_pretrip_template_inspection_idx
  on public.fleet_pretrip_template_assignments (inspection_template_id);
create index if not exists fleet_pretrip_template_created_by_idx
  on public.fleet_pretrip_template_assignments (created_by);

create index if not exists fleet_defect_clarification_shop_idx
  on public.fleet_defect_clarifications (shop_id);
create index if not exists fleet_defect_clarification_vehicle_idx
  on public.fleet_defect_clarifications (vehicle_id);
create index if not exists fleet_defect_clarification_requested_by_idx
  on public.fleet_defect_clarifications (requested_by);
create index if not exists fleet_defect_clarification_responded_by_idx
  on public.fleet_defect_clarifications (responded_by)
  where responded_by is not null;

create index if not exists fleet_driver_evidence_shop_idx
  on public.fleet_driver_evidence (shop_id);
create index if not exists fleet_driver_evidence_fleet_idx
  on public.fleet_driver_evidence (fleet_id);
create index if not exists fleet_driver_evidence_vehicle_idx
  on public.fleet_driver_evidence (vehicle_id);
create index if not exists fleet_driver_evidence_clarification_idx
  on public.fleet_driver_evidence (clarification_id)
  where clarification_id is not null;
create index if not exists fleet_driver_evidence_uploaded_by_idx
  on public.fleet_driver_evidence (uploaded_by);

commit;
