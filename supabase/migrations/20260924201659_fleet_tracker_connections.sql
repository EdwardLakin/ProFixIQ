-- Fleet telematics tracker connections (Geotab first; Samsara/Motive follow
-- the same shape). Isolated addition: new tables only, no existing objects
-- touched.

CREATE TABLE IF NOT EXISTS public.fleet_tracker_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  vendor text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  credentials jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  connected_at timestamp with time zone DEFAULT now() NOT NULL,
  last_sync_at timestamp with time zone,
  last_error text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT fleet_tracker_connections_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_tracker_connections_shop_vendor_unique UNIQUE (shop_id, vendor),
  CONSTRAINT fleet_tracker_connections_vendor_check
    CHECK (vendor = ANY (ARRAY['geotab'::text, 'samsara'::text, 'motive'::text])),
  CONSTRAINT fleet_tracker_connections_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'error'::text, 'disabled'::text])),
  CONSTRAINT fleet_tracker_connections_shop_id_fkey
    FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE,
  CONSTRAINT fleet_tracker_connections_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.fleet_tracker_vehicle_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  vendor_vehicle_id text NOT NULL,
  vehicle_id uuid,
  vendor_name text,
  vendor_vin text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT fleet_tracker_vehicle_links_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_tracker_vehicle_links_connection_vehicle_unique
    UNIQUE (connection_id, vendor_vehicle_id),
  CONSTRAINT fleet_tracker_vehicle_links_shop_id_fkey
    FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE,
  CONSTRAINT fleet_tracker_vehicle_links_connection_id_fkey
    FOREIGN KEY (connection_id) REFERENCES public.fleet_tracker_connections(id) ON DELETE CASCADE,
  CONSTRAINT fleet_tracker_vehicle_links_vehicle_id_fkey
    FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS fleet_tracker_connections_shop_idx
  ON public.fleet_tracker_connections USING btree (shop_id);

CREATE INDEX IF NOT EXISTS fleet_tracker_vehicle_links_shop_idx
  ON public.fleet_tracker_vehicle_links USING btree (shop_id);

CREATE INDEX IF NOT EXISTS fleet_tracker_vehicle_links_connection_idx
  ON public.fleet_tracker_vehicle_links USING btree (connection_id);

CREATE INDEX IF NOT EXISTS fleet_tracker_vehicle_links_vehicle_idx
  ON public.fleet_tracker_vehicle_links USING btree (vehicle_id)
  WHERE vehicle_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_fleet_tracker_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE TRIGGER trg_fleet_tracker_connections_updated_at
  BEFORE UPDATE ON public.fleet_tracker_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_fleet_tracker_updated_at();

CREATE TRIGGER trg_fleet_tracker_vehicle_links_updated_at
  BEFORE UPDATE ON public.fleet_tracker_vehicle_links
  FOR EACH ROW EXECUTE FUNCTION public.set_fleet_tracker_updated_at();

ALTER TABLE public.fleet_tracker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_tracker_vehicle_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fleet_tracker_connections_select_in_shop"
  ON public.fleet_tracker_connections AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (public.user_is_in_shop(shop_id));

CREATE POLICY "fleet_tracker_connections_write_shop_admin"
  ON public.fleet_tracker_connections AS PERMISSIVE FOR ALL TO PUBLIC
  USING (COALESCE(public.shop_role_v2(shop_id), ''::text) = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (COALESCE(public.shop_role_v2(shop_id), ''::text) = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY "fleet_tracker_vehicle_links_select_in_shop"
  ON public.fleet_tracker_vehicle_links AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (public.user_is_in_shop(shop_id));

CREATE POLICY "fleet_tracker_vehicle_links_write_shop_admin"
  ON public.fleet_tracker_vehicle_links AS PERMISSIVE FOR ALL TO PUBLIC
  USING (COALESCE(public.shop_role_v2(shop_id), ''::text) = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (COALESCE(public.shop_role_v2(shop_id), ''::text) = ANY (ARRAY['owner'::text, 'admin'::text]));

REVOKE ALL ON TABLE public.fleet_tracker_connections FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.fleet_tracker_vehicle_links FROM PUBLIC, anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public.fleet_tracker_connections TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.fleet_tracker_vehicle_links TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fleet_tracker_connections TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fleet_tracker_vehicle_links TO anon, authenticated;
