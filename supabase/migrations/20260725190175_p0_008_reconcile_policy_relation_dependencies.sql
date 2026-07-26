-- P0-008: restore relations required by recovered row-level policies.
--
-- These two tables exist in the deployed schema but were absent from the
-- canonical baseline. Keeping them in the shape layer lets the later
-- authorization migration compile on an empty replay without weakening RLS.
-- This layer follows integrity recovery because org_members references the
-- organizations primary key restored there.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE TABLE IF NOT EXISTS public.org_members (
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_members_pkey PRIMARY KEY (org_id, user_id),
  CONSTRAINT org_members_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT org_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON public.org_members (user_id);

CREATE TABLE IF NOT EXISTS public.parts_suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  supplier_name text NOT NULL,
  api_key text,
  api_base_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT parts_suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT parts_suppliers_shop_id_fkey
    FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parts_suppliers__shop_id
  ON public.parts_suppliers (shop_id);

CREATE TABLE IF NOT EXISTS public.supplier_catalog_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  supplier_id uuid,
  external_sku text NOT NULL,
  description text,
  brand text,
  cost numeric(10,2),
  price numeric(10,2),
  compatibility jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT supplier_catalog_items_pkey PRIMARY KEY (id),
  CONSTRAINT supplier_catalog_items_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.parts_suppliers(id) ON DELETE CASCADE
);

-- PostgreSQL does not index the referencing side of a foreign key. This index
-- also supports the supplier-scoped RLS lookup restored later in the chain.
CREATE INDEX IF NOT EXISTS idx_supplier_catalog_items_supplier_id
  ON public.supplier_catalog_items (supplier_id);

COMMIT;
