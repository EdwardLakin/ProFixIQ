-- Add optional vehicle detail fields used by CSV imports and customer vehicle detail views.
-- All columns are nullable and additive so existing production-like rows remain valid.

alter table public.vehicles
  add column if not exists state_province text,
  add column if not exists odometer_unit text,
  add column if not exists body_type text,
  add column if not exists asset_type text,
  add column if not exists status text,
  add column if not exists purchase_date date,
  add column if not exists in_service_date date,
  add column if not exists last_service_date date,
  add column if not exists tags text,
  add column if not exists notes text;

comment on column public.vehicles.state_province is 'Plate state/province imported from vehicle CSV or entered by staff.';
comment on column public.vehicles.odometer_unit is 'Mileage/odometer unit, for example mi, km, or hours.';
comment on column public.vehicles.body_type is 'Vehicle body type imported from external source.';
comment on column public.vehicles.asset_type is 'Fleet asset type imported from external source.';
comment on column public.vehicles.status is 'Vehicle or asset status imported from external source.';
comment on column public.vehicles.tags is 'Source tags preserved as text from vehicle CSV import.';
comment on column public.vehicles.notes is 'Vehicle notes preserved from source CSV or entered by staff.';
