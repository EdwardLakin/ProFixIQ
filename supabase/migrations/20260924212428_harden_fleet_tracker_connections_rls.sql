-- Review fixes for fleet_tracker_connections / fleet_tracker_vehicle_links
-- (PR #1743):
--
-- 1. fleet_tracker_connections.credentials holds a plaintext Geotab
--    password. The prior select-in-shop policy let any shop member read
--    the row (and therefore the password) even though the app only ever
--    exposes sanitized status through owner/admin-gated routes. Dropping
--    it leaves the existing write_shop_admin ALL policy as the only
--    policy on the table, which already restricts every action —
--    including SELECT — to owner/admin.
--
-- 2. fleet_tracker_vehicle_links' write policy checked only that the
--    caller was owner/admin of the row's own shop_id, not that
--    connection_id or vehicle_id actually belonged to that same shop.
--    An admin could reference another tenant's connection or vehicle by
--    UUID. The replacement WITH CHECK verifies both relationships stay
--    inside the caller's shop.

DROP POLICY IF EXISTS "fleet_tracker_connections_select_in_shop" ON public.fleet_tracker_connections;

DROP POLICY IF EXISTS "fleet_tracker_vehicle_links_write_shop_admin" ON public.fleet_tracker_vehicle_links;

CREATE POLICY "fleet_tracker_vehicle_links_write_shop_admin"
  ON public.fleet_tracker_vehicle_links AS PERMISSIVE FOR ALL TO PUBLIC
  USING (COALESCE(public.shop_role_v2(shop_id), ''::text) = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (
    COALESCE(public.shop_role_v2(shop_id), ''::text) = ANY (ARRAY['owner'::text, 'admin'::text])
    AND EXISTS (
      SELECT 1 FROM public.fleet_tracker_connections c
      WHERE c.id = fleet_tracker_vehicle_links.connection_id
        AND c.shop_id = fleet_tracker_vehicle_links.shop_id
    )
    AND (
      fleet_tracker_vehicle_links.vehicle_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id = fleet_tracker_vehicle_links.vehicle_id
          AND v.shop_id = fleet_tracker_vehicle_links.shop_id
      )
    )
  );
