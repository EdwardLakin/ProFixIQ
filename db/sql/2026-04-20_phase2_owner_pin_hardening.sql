-- Phase 2: Owner PIN hardening
-- Canonical source of truth is shops.owner_pin_hash.
-- Legacy plaintext columns (shops.owner_pin, shops.pin) are backfilled then disabled.

begin;

create extension if not exists pgcrypto;

update public.shops
set owner_pin_hash = case
  when owner_pin_hash is null
    and owner_pin is not null
    and btrim(owner_pin) ~ '^[0-9]{4,8}$'
    then crypt(btrim(owner_pin), gen_salt('bf'))
  when owner_pin_hash is null
    and pin is not null
    and btrim(pin) ~ '^[0-9]{4,8}$'
    then crypt(btrim(pin), gen_salt('bf'))
  else owner_pin_hash
end
where owner_pin_hash is null
  and (
    (owner_pin is not null and btrim(owner_pin) ~ '^[0-9]{4,8}$')
    or (pin is not null and btrim(pin) ~ '^[0-9]{4,8}$')
  );

update public.shops
set owner_pin = null,
    pin = null
where owner_pin is not null
   or pin is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shops_owner_pin_plaintext_unused_chk'
      and conrelid = 'public.shops'::regclass
  ) then
    alter table public.shops
      add constraint shops_owner_pin_plaintext_unused_chk
      check (owner_pin is null and pin is null) not valid;
  end if;
end;
$$;

alter table public.shops
  validate constraint shops_owner_pin_plaintext_unused_chk;

commit;
