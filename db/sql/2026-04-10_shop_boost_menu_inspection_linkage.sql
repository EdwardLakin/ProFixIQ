-- Shop Boost menu/inspection suggestion linkage (additive, non-breaking)
-- 1) Allow low-confidence menu suggestions to reference a paired inspection template suggestion.
alter table public.menu_item_suggestions
  add column if not exists inspection_template_suggestion_id uuid;

-- 2) Keep relationship safe and nullable for review-first flow.
alter table public.menu_item_suggestions
  drop constraint if exists menu_item_suggestions_inspection_template_suggestion_id_fkey;

alter table public.menu_item_suggestions
  add constraint menu_item_suggestions_inspection_template_suggestion_id_fkey
  foreign key (inspection_template_suggestion_id)
  references public.inspection_template_suggestions(id)
  on delete set null;

-- 3) Add lookup index for suggestion review and join performance.
create index if not exists idx_menu_item_suggestions_inspection_template_suggestion_id
  on public.menu_item_suggestions(inspection_template_suggestion_id);
