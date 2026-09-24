CREATE INDEX IF NOT EXISTS fleet_tracker_connections_created_by_idx
  ON public.fleet_tracker_connections USING btree (created_by)
  WHERE created_by IS NOT NULL;
