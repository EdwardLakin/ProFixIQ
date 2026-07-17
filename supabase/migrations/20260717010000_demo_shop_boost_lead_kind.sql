begin;

alter table public.demo_shop_boost_leads
  add column if not exists lead_kind text;

update public.demo_shop_boost_leads
set lead_kind = case
  when summary ilike 'Shared by %' then 'share_recipient'
  else 'activation_claim'
end
where lead_kind is null;

alter table public.demo_shop_boost_leads
  alter column lead_kind set default 'activation_claim',
  alter column lead_kind set not null;

alter table public.demo_shop_boost_leads
  drop constraint if exists demo_shop_boost_leads_lead_kind_check;

alter table public.demo_shop_boost_leads
  add constraint demo_shop_boost_leads_lead_kind_check
  check (lead_kind in ('activation_claim', 'share_recipient'));

create index if not exists demo_shop_boost_leads_activation_claim_idx
  on public.demo_shop_boost_leads (demo_id, lower(email))
  where lead_kind = 'activation_claim';

commit;
