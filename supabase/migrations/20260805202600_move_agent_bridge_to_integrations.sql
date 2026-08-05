begin;

insert into public.integrations (
  id,
  shop_id,
  provider,
  status,
  config,
  created_at,
  updated_at
)
select
  '7c2da329-5117-48c0-a1ee-d51b5d63827d'::uuid,
  null,
  'aftermarket_api',
  'enabled',
  jsonb_build_object(
    'kind', 'profixiq_agent_bridge',
    'secret', bridge.secret
  ),
  bridge.created_at,
  now()
from public.agent_bridge_credentials bridge
where bridge.id = 'profixiq'
  and bridge.active = true
on conflict (id) do update
set shop_id = null,
    provider = excluded.provider,
    status = excluded.status,
    config = excluded.config,
    updated_at = now();

drop table public.agent_bridge_credentials;

commit;
