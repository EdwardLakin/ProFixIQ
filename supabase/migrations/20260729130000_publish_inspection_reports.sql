BEGIN;

CREATE OR REPLACE FUNCTION public.sync_finalized_inspection_to_work_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_canonical
     AND NEW.work_order_id IS NOT NULL
     AND NEW.pdf_storage_path IS NOT NULL
     AND (OLD.pdf_storage_path IS DISTINCT FROM NEW.pdf_storage_path
          OR OLD.work_order_id IS DISTINCT FROM NEW.work_order_id) THEN
    UPDATE public.work_orders
       SET inspection_id = NEW.id,
           inspection_pdf_url = '/api/inspections/' || NEW.id || '/report/pdf'
     WHERE id = NEW.work_order_id
       AND shop_id = NEW.shop_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_finalized_inspection_to_work_order
  ON public.inspections;
CREATE TRIGGER sync_finalized_inspection_to_work_order
AFTER INSERT OR UPDATE OF pdf_storage_path, work_order_id, is_canonical
ON public.inspections
FOR EACH ROW
EXECUTE FUNCTION public.sync_finalized_inspection_to_work_order();

WITH selected AS (
  SELECT DISTINCT ON (i.work_order_id, i.shop_id)
    i.work_order_id,
    i.shop_id,
    i.id
  FROM public.inspections i
  WHERE i.work_order_id IS NOT NULL
    AND i.is_canonical
    AND i.pdf_storage_path IS NOT NULL
  ORDER BY
    i.work_order_id,
    i.shop_id,
    i.finalized_at DESC NULLS LAST,
    i.updated_at DESC,
    i.id DESC
)
UPDATE public.work_orders wo
SET inspection_id = selected.id,
    inspection_pdf_url = '/api/inspections/' || selected.id || '/report/pdf'
FROM selected
WHERE selected.work_order_id = wo.id
  AND selected.shop_id = wo.shop_id
  AND (wo.inspection_id IS NULL OR wo.inspection_pdf_url IS NULL);

CREATE OR REPLACE FUNCTION public.attach_signed_inspection_pdf_atomic(
  p_inspection_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_expected_sync_revision bigint,
  p_pdf_storage_path text,
  p_pdf_sha256 text,
  p_pdf_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.inspections%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_user_id THEN
    RAISE EXCEPTION 'Actor identity mismatch';
  END IF;
  SELECT * INTO target
  FROM public.inspections
  WHERE id = p_inspection_id
    AND work_order_line_id = p_work_order_line_id
    AND is_canonical
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE (p.id = p_actor_user_id OR p.user_id = p_actor_user_id)
      AND p.shop_id = target.shop_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF target.sync_revision <> p_expected_sync_revision THEN
    RAISE EXCEPTION 'Saved inspection revision changed';
  END IF;
  IF NOT target.completed OR NOT target.locked OR target.is_draft THEN
    RAISE EXCEPTION 'Inspection must be signed and complete';
  END IF;
  IF target.pdf_storage_path IS NOT NULL THEN
    IF target.pdf_storage_path <> p_pdf_storage_path THEN
      RAISE EXCEPTION 'Inspection already has a different immutable report';
    END IF;
    RETURN jsonb_build_object('inspection_id', target.id, 'reused', true);
  END IF;
  UPDATE public.inspections
  SET pdf_storage_path = p_pdf_storage_path,
      pdf_sha256 = p_pdf_sha256,
      pdf_url = p_pdf_url,
      finalized_at = COALESCE(finalized_at, now()),
      finalized_by = COALESCE(finalized_by, p_actor_user_id)
  WHERE id = target.id;
  RETURN jsonb_build_object('inspection_id', target.id, 'reused', false);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) TO authenticated, service_role;

COMMIT;
