-- Phase 1 hardening: remove global shop visibility.
-- Broad public SELECT on shops enables cross-tenant metadata leakage.
-- Keep existing authenticated shop-scoped policy in place.

DROP POLICY IF EXISTS "shops_public_select" ON public.shops;
