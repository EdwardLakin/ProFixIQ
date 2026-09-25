-- One maintenance rule per service per exact vehicle spec, so concurrent
-- first-lookup schedule generation cannot insert duplicate rule sets.
-- NULLS NOT DISTINCT keeps generic (make/model/engine NULL) rows unique too.
ALTER TABLE public.maintenance_rules
  ADD CONSTRAINT maintenance_rules_vehicle_service_key
  UNIQUE NULLS NOT DISTINCT (service_code, make, model, year_from, year_to, engine_family);
