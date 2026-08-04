from pathlib import Path

migration = Path(
    "supabase/migrations/20260804120000_codex_review_followup_hardening.sql"
)
text = migration.read_text(encoding="utf-8")

old = """         count(distinct move.location_id) location_count,
         min(move.location_id) location_id
"""
new = """         count(distinct move.location_id) location_count,
         (array_agg(move.location_id order by move.location_id))[1] location_id
"""
if old not in text:
    raise RuntimeError("PO reconciliation location aggregate was not found")
text = text.replace(old, new, 1)

anchor = """  unique(shop_id,purchase_order_id,part_id,reason)
);

create or replace function public.receive_po_part_and_allocate(
"""
replacement = """  unique(shop_id,purchase_order_id,part_id,reason)
);

alter table public.inventory_reconciliation_exceptions enable row level security;
revoke all on table public.inventory_reconciliation_exceptions
  from public, anon, authenticated;
grant all on table public.inventory_reconciliation_exceptions to service_role;

create or replace function public.receive_po_part_and_allocate(
"""
if anchor not in text:
    raise RuntimeError("Reconciliation table security insertion point was not found")
text = text.replace(anchor, replacement, 1)

migration.write_text(text, encoding="utf-8")
Path(__file__).unlink(missing_ok=True)
Path(".github/workflows/fix-codex-followup-migration-replay.yml").unlink(
    missing_ok=True
)
