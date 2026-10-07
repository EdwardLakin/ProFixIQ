from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


migration = r'''begin;

-- Lifecycle conversion measurement is observational only. The canonical
-- acquisition and guided-onboarding flows call these additive service-role
-- adapters after their own authoritative state transitions. No trigger is
-- attached to a pre-existing shared lifecycle table.
create unique index if not exists marketing_events_lifecycle_attempt_uidx
  on public.marketing_events (event_name, checkout_attempt_id)
  where event_name in ('signup_completed', 'onboarding_completed')
    and checkout_attempt_id is not null;

create or replace function public.record_marketing_signup_completed(
  p_intent_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_intent record;
  v_attempt_id uuid;
  v_user_created_at timestamptz;
  v_checkout record;
begin
  select i.request_key, i.created_at
    into v_intent
  from private.stripe_acquisition_intents as i
  where i.id = p_intent_id
    and i.status = 'claimed'
    and i.claimed_user_id = p_user_id;

  if not found then
    return false;
  end if;

  select u.created_at
    into v_user_created_at
  from auth.users as u
  where u.id = p_user_id;

  -- Existing accounts can claim a completed acquisition. Count signup only
  -- when this auth identity was actually created after the acquisition began.
  if v_user_created_at is null or v_user_created_at < v_intent.created_at then
    return false;
  end if;

  if v_intent.request_key !~* '^acq:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_attempt_id := substring(v_intent.request_key from 5)::uuid;

  select me.package_key, me.interval, me.checkout_mode
    into v_checkout
  from public.marketing_events as me
  where me.event_name = 'checkout_started'
    and me.checkout_attempt_id = v_attempt_id
  order by me.created_at asc
  limit 1;

  if not found then
    return false;
  end if;

  insert into public.marketing_events (
    event_name,
    package_key,
    interval,
    checkout_mode,
    checkout_attempt_id
  ) values (
    'signup_completed',
    v_checkout.package_key,
    v_checkout.interval,
    v_checkout.checkout_mode,
    v_attempt_id
  )
  on conflict do nothing;

  return true;
exception
  when others then
    raise warning 'marketing signup lifecycle capture failed [%]', sqlstate;
    return false;
end;
$function$;

alter function public.record_marketing_signup_completed(uuid, uuid)
  owner to postgres;
revoke all on function public.record_marketing_signup_completed(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_marketing_signup_completed(uuid, uuid)
  to service_role;

create or replace function public.record_marketing_onboarding_completed(
  p_session_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_session record;
  v_intent record;
  v_attempt_id uuid;
  v_signup record;
begin
  select s.created_by, s.status
    into v_session
  from public.guided_onboarding_sessions as s
  where s.id = p_session_id
    and s.shop_id = p_shop_id;

  if not found or v_session.status <> 'completed' then
    return false;
  end if;

  -- Prefer the durable claimed-shop binding. A newly created owner can claim
  -- checkout before a shop exists, so allow the session creator to bind the
  -- still-null claimed_shop_id without consulting mutable Stripe billing state.
  for v_intent in
    select i.request_key
    from private.stripe_acquisition_intents as i
    where i.status = 'claimed'
      and (
        i.claimed_shop_id = p_shop_id
        or (
          i.claimed_shop_id is null
          and v_session.created_by is not null
          and i.claimed_user_id = v_session.created_by
        )
      )
    order by
      case when i.claimed_shop_id = p_shop_id then 0 else 1 end,
      i.claimed_at desc nulls last,
      i.created_at desc
  loop
    if v_intent.request_key !~* '^acq:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      continue;
    end if;

    v_attempt_id := substring(v_intent.request_key from 5)::uuid;

    -- A downstream onboarding conversion is only valid for an acquisition
    -- that already produced the authoritative new-account signup event.
    select me.package_key, me.interval, me.checkout_mode
      into v_signup
    from public.marketing_events as me
    where me.event_name = 'signup_completed'
      and me.checkout_attempt_id = v_attempt_id
    order by me.created_at asc
    limit 1;

    if found then
      exit;
    end if;
    v_attempt_id := null;
  end loop;

  if v_attempt_id is null then
    return false;
  end if;

  insert into public.marketing_events (
    event_name,
    package_key,
    interval,
    checkout_mode,
    checkout_attempt_id
  ) values (
    'onboarding_completed',
    v_signup.package_key,
    v_signup.interval,
    v_signup.checkout_mode,
    v_attempt_id
  )
  on conflict do nothing;

  return true;
exception
  when others then
    raise warning 'marketing onboarding lifecycle capture failed [%]', sqlstate;
    return false;
end;
$function$;

alter function public.record_marketing_onboarding_completed(uuid, uuid)
  owner to postgres;
revoke all on function public.record_marketing_onboarding_completed(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_marketing_onboarding_completed(uuid, uuid)
  to service_role;

-- Extend the prior acquisition snapshot without changing its contract. The
-- wrapper and lifecycle counts execute in one statement/MVCC snapshot.
create or replace function public.get_ops_marketing_lifecycle_funnel_snapshot(
  p_since timestamptz,
  p_breakdown_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with acquisition as (
    select public.get_ops_marketing_funnel_snapshot(
      p_since,
      p_breakdown_limit
    ) as snapshot
  ),
  lifecycle as (
    select
      count(*) filter (where event_name = 'signup_completed')::bigint as signup_completed,
      count(*) filter (where event_name = 'onboarding_completed')::bigint as onboarding_completed
    from public.marketing_events
    where created_at >= p_since
  )
  select a.snapshot || jsonb_build_object(
    'lifecycleSummary', jsonb_build_object(
      'signupCompleted', l.signup_completed,
      'onboardingCompleted', l.onboarding_completed
    )
  )
  from acquisition as a
  cross join lifecycle as l;
$function$;

alter function public.get_ops_marketing_lifecycle_funnel_snapshot(timestamptz, integer)
  owner to postgres;
revoke all on function public.get_ops_marketing_lifecycle_funnel_snapshot(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_ops_marketing_lifecycle_funnel_snapshot(timestamptz, integer)
  to service_role;

commit;
'''
Path('supabase/migrations/20261007204500_marketing_lifecycle_conversion.sql').write_text(migration)

helper = r'''import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const LIFECYCLE_ANALYTICS_TIMEOUT_MS = 250;

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

async function withLifecycleTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("marketing lifecycle analytics timeout")),
          LIFECYCLE_ANALYTICS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function recordMarketingSignupCompleted(args: {
  admin: AdminSupabase;
  intentId: string;
  userId: string;
}): Promise<boolean> {
  try {
    const { data, error } = await withLifecycleTimeout(
      args.admin.rpc("record_marketing_signup_completed", {
        p_intent_id: args.intentId,
        p_user_id: args.userId,
      }),
    );
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.warn("marketing_signup_completed_capture_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

export async function recordMarketingOnboardingCompleted(args: {
  sessionId: string;
  shopId: string;
}): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await withLifecycleTimeout(
      admin.rpc("record_marketing_onboarding_completed", {
        p_session_id: args.sessionId,
        p_shop_id: args.shopId,
      }),
    );
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.warn("marketing_onboarding_completed_capture_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}
'''
Path('features/analytics/server/lifecycle-conversion.ts').write_text(helper)

replace_once(
    'features/stripe/api/stripe/checkout/link-user/route.ts',
    'import { z } from "zod";\n\n',
    'import { z } from "zod";\n\nimport { recordMarketingSignupCompleted } from "@/features/analytics/server/lifecycle-conversion";\n',
)
replace_once(
    'features/stripe/api/stripe/checkout/link-user/route.ts',
    '    if (earlyAccessGrantId && metadata.packageKey) {\n',
    '    await recordMarketingSignupCompleted({\n      admin,\n      intentId: metadata.intentId,\n      userId: user.id,\n    });\n\n    if (earlyAccessGrantId && metadata.packageKey) {\n',
)

replace_once(
    'features/onboarding-v2/guided/server.ts',
    'import { NextResponse } from "next/server";\n',
    'import { NextResponse } from "next/server";\nimport { recordMarketingOnboardingCompleted } from "@/features/analytics/server/lifecycle-conversion";\n',
)
replace_once(
    'features/onboarding-v2/guided/server.ts',
    '  if (error) throw new Error(error.message);\n  return data as GuidedOnboardingSessionRow;\n}\n\nasync function ensureGuidedSteps',
    '  if (error) throw new Error(error.message);\n  const updatedSession = data as GuidedOnboardingSessionRow;\n  if (updatedSession?.status === "completed" && access.profile.shop_id) {\n    await recordMarketingOnboardingCompleted({\n      sessionId,\n      shopId: access.profile.shop_id,\n    });\n  }\n  return updatedSession;\n}\n\nasync function ensureGuidedSteps',
)

replace_once(
    'features/onboarding-v2/guided/instantAnalysisHandoff.ts',
    'import type { SupabaseClient } from "@supabase/supabase-js";\n',
    'import type { SupabaseClient } from "@supabase/supabase-js";\nimport { recordMarketingOnboardingCompleted } from "@/features/analytics/server/lifecycle-conversion";\n',
)
replace_once(
    'features/onboarding-v2/guided/instantAnalysisHandoff.ts',
    '  if (updateSessionError) throw new Error(updateSessionError.message);\n\n  const { error: eventError }',
    '  if (updateSessionError) throw new Error(updateSessionError.message);\n\n  if (!nextStep) {\n    await recordMarketingOnboardingCompleted({\n      sessionId,\n      shopId: args.shopId,\n    });\n  }\n\n  const { error: eventError }',
)

test = r'''import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const migration = read(
  "supabase/migrations/20261007204500_marketing_lifecycle_conversion.sql",
);
const linkUserRoute = read(
  "features/stripe/api/stripe/checkout/link-user/route.ts",
);
const guidedServer = read("features/onboarding-v2/guided/server.ts");
const instantHandoff = read(
  "features/onboarding-v2/guided/instantAnalysisHandoff.ts",
);
const lifecycleHelper = read(
  "features/analytics/server/lifecycle-conversion.ts",
);
const opsServer = read("features/ops/server/get-marketing-funnel.ts");
const runtimeFixture = read(
  "tests/security/marketing-lifecycle-conversion.runtime.sql",
);
const cleanReplay = read(".github/workflows/supabase-clean-replay-audit.yml");

describe("marketing lifecycle conversion", () => {
  it("uses additive service-role adapters instead of shared-table triggers", () => {
    expect(migration).toContain(
      "create or replace function public.record_marketing_signup_completed(",
    );
    expect(migration).toContain(
      "create or replace function public.record_marketing_onboarding_completed(",
    );
    expect(migration).not.toContain("create trigger capture_marketing_signup_completed");
    expect(migration).not.toContain(
      "create trigger capture_marketing_onboarding_completed",
    );
    expect(migration).toContain(
      "grant execute on function public.record_marketing_signup_completed(uuid, uuid)",
    );
    expect(migration).toContain(
      "grant execute on function public.record_marketing_onboarding_completed(uuid, uuid)",
    );
    expect(migration).toContain("to service_role");
  });

  it("counts signup only for a new auth identity on the claimed acquisition", () => {
    expect(migration).toContain("i.claimed_user_id = p_user_id");
    expect(migration).toContain("v_user_created_at < v_intent.created_at");
    expect(migration).toContain("me.event_name = 'checkout_started'");
    expect(migration).toContain("'signup_completed'");
    expect(linkUserRoute).toContain("recordMarketingSignupCompleted({");
    expect(linkUserRoute).toContain("intentId: metadata.intentId");
  });

  it("requires signup before onboarding and avoids mutable billing-session correlation", () => {
    expect(migration).toContain("i.claimed_shop_id = p_shop_id");
    expect(migration).toContain("i.claimed_user_id = v_session.created_by");
    expect(migration).toContain("me.event_name = 'signup_completed'");
    expect(migration).not.toContain("s.stripe_checkout_session_id");
    expect(guidedServer).toContain("recordMarketingOnboardingCompleted({");
    expect(instantHandoff).toContain("recordMarketingOnboardingCompleted({");
  });

  it("keeps lifecycle analytics idempotent, anonymous, and fail-open", () => {
    expect(migration).toContain("marketing_events_lifecycle_attempt_uidx");
    expect(migration).toContain("on conflict do nothing");
    expect(migration).not.toMatch(/insert into public\.marketing_events[\s\S]*?(user_id|shop_id)/i);
    expect(lifecycleHelper).toContain("LIFECYCLE_ANALYTICS_TIMEOUT_MS = 250");
    expect(lifecycleHelper).toContain("return false;");
    expect(lifecycleHelper).toContain("catch (error)");
  });

  it("extends Ops through one service-role lifecycle snapshot RPC", () => {
    expect(migration).toContain(
      "create or replace function public.get_ops_marketing_lifecycle_funnel_snapshot(",
    );
    expect(opsServer).toMatch(
      /admin\.rpc\(\s*"get_ops_marketing_lifecycle_funnel_snapshot"/,
    );
    expect(opsServer).toContain("checkoutToSignupPct");
    expect(opsServer).toContain("signupToOnboardingPct");
  });

  it("runs lifecycle behavior against the replayed database", () => {
    expect(runtimeFixture).toContain("record_marketing_signup_completed");
    expect(runtimeFixture).toContain("record_marketing_onboarding_completed");
    expect(runtimeFixture).toContain("existing-account acquisition emitted signup_completed");
    expect(runtimeFixture).toContain("billing-session replacement broke durable onboarding correlation");
    expect(cleanReplay).toContain(
      "tests/security/marketing-lifecycle-conversion.runtime.sql",
    );
  });
});
'''
Path('tests/marketing-lifecycle-conversion.test.ts').write_text(test)

runtime = r'''\set ON_ERROR_STOP on

begin;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.record_marketing_signup_completed(uuid,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.record_marketing_signup_completed(uuid,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.record_marketing_signup_completed(uuid,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'anon',
    'public.record_marketing_onboarding_completed(uuid,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.record_marketing_onboarding_completed(uuid,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.record_marketing_onboarding_completed(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'marketing lifecycle runtime assertion failed: RPC ACL is unsafe';
  end if;
end
$$;

insert into auth.users (id, email, created_at, raw_user_meta_data)
values
  (
    '8a100000-0000-4000-8000-000000000001',
    'lifecycle-new@example.com',
    now(),
    '{"full_name":"Lifecycle New"}'::jsonb
  ),
  (
    '8a200000-0000-4000-8000-000000000002',
    'lifecycle-existing@example.com',
    now() - interval '7 days',
    '{"full_name":"Lifecycle Existing"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  (
    '8a100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001',
    'owner',
    'Lifecycle New',
    'lifecycle-new@example.com',
    null
  ),
  (
    '8a200000-0000-4000-8000-000000000002',
    '8a200000-0000-4000-8000-000000000002',
    'owner',
    'Lifecycle Existing',
    'lifecycle-existing@example.com',
    null
  )
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  (
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001',
    'Lifecycle New Shop',
    'Lifecycle New Shop',
    3
  ),
  (
    '8b200000-0000-4000-8000-000000000002',
    '8a200000-0000-4000-8000-000000000002',
    'Lifecycle Existing Shop',
    'Lifecycle Existing Shop',
    3
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '8a100000-0000-4000-8000-000000000001'
    then '8b100000-0000-4000-8000-000000000001'::uuid
  when '8a200000-0000-4000-8000-000000000002'
    then '8b200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '8a100000-0000-4000-8000-000000000001',
  '8a200000-0000-4000-8000-000000000002'
);

insert into private.stripe_acquisition_intents (
  id,
  request_key,
  nonce,
  plan_key,
  stripe_price_id,
  trial_days,
  status,
  stripe_checkout_session_id,
  stripe_customer_id,
  stripe_subscription_id,
  checkout_email,
  expires_at,
  claimed_user_id,
  claimed_shop_id,
  claimed_at,
  created_at,
  updated_at
)
values
  (
    '8c100000-0000-4000-8000-000000000001',
    'acq:8d100000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'complete',
    'price_lifecycle_new',
    14,
    'claimed',
    'cs_test_lifecycle_new',
    'cus_lifecycle_new',
    'sub_lifecycle_new',
    'lifecycle-new@example.com',
    now() + interval '1 day',
    '8a100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001',
    now(),
    now() - interval '1 hour',
    now()
  ),
  (
    '8c200000-0000-4000-8000-000000000002',
    'acq:8d200000-0000-4000-8000-000000000002',
    repeat('b', 64),
    'complete',
    'price_lifecycle_existing',
    14,
    'claimed',
    'cs_test_lifecycle_existing',
    'cus_lifecycle_existing',
    'sub_lifecycle_existing',
    'lifecycle-existing@example.com',
    now() + interval '1 day',
    '8a200000-0000-4000-8000-000000000002',
    '8b200000-0000-4000-8000-000000000002',
    now(),
    now() - interval '1 hour',
    now()
  );

insert into public.marketing_events (
  event_name,
  package_key,
  interval,
  checkout_mode,
  checkout_attempt_id
)
values
  ('checkout_started', 'complete', 'monthly', 'trial', '8d100000-0000-4000-8000-000000000001'),
  ('checkout_started', 'complete', 'monthly', 'trial', '8d200000-0000-4000-8000-000000000002');

do $$
declare
  v_result boolean;
  v_count integer;
begin
  select public.record_marketing_signup_completed(
    '8c100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001'
  ) into v_result;
  if not v_result then
    raise exception 'marketing lifecycle runtime assertion failed: new-account signup was not recorded';
  end if;

  perform public.record_marketing_signup_completed(
    '8c100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001'
  );
  select count(*) into v_count
  from public.marketing_events
  where event_name = 'signup_completed'
    and checkout_attempt_id = '8d100000-0000-4000-8000-000000000001';
  if v_count <> 1 then
    raise exception 'marketing lifecycle runtime assertion failed: signup idempotence broke';
  end if;

  select public.record_marketing_signup_completed(
    '8c200000-0000-4000-8000-000000000002',
    '8a200000-0000-4000-8000-000000000002'
  ) into v_result;
  if v_result then
    raise exception 'marketing lifecycle runtime assertion failed: existing-account acquisition emitted signup_completed';
  end if;
end
$$;

insert into public.guided_onboarding_sessions (
  id,
  shop_id,
  created_by,
  status,
  current_step_key,
  completed_at
)
values
  (
    '8e100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001',
    '8a100000-0000-4000-8000-000000000001',
    'completed',
    null,
    now()
  ),
  (
    '8e200000-0000-4000-8000-000000000002',
    '8b200000-0000-4000-8000-000000000002',
    '8a200000-0000-4000-8000-000000000002',
    'completed',
    null,
    now()
  );

-- Simulate a later billing-session replacement. Lifecycle correlation must use
-- the durable acquisition binding, not this mutable shop billing field.
update public.shops
set stripe_checkout_session_id = 'cs_test_replaced_after_claim'
where id = '8b100000-0000-4000-8000-000000000001';

do $$
declare
  v_result boolean;
  v_count integer;
  v_event_text text;
begin
  select public.record_marketing_onboarding_completed(
    '8e100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001'
  ) into v_result;
  if not v_result then
    raise exception 'marketing lifecycle runtime assertion failed: billing-session replacement broke durable onboarding correlation';
  end if;

  perform public.record_marketing_onboarding_completed(
    '8e100000-0000-4000-8000-000000000001',
    '8b100000-0000-4000-8000-000000000001'
  );
  select count(*) into v_count
  from public.marketing_events
  where event_name = 'onboarding_completed'
    and checkout_attempt_id = '8d100000-0000-4000-8000-000000000001';
  if v_count <> 1 then
    raise exception 'marketing lifecycle runtime assertion failed: onboarding idempotence broke';
  end if;

  select public.record_marketing_onboarding_completed(
    '8e200000-0000-4000-8000-000000000002',
    '8b200000-0000-4000-8000-000000000002'
  ) into v_result;
  if v_result then
    raise exception 'marketing lifecycle runtime assertion failed: existing-account acquisition emitted onboarding_completed';
  end if;

  select row_to_json(me)::text into v_event_text
  from public.marketing_events as me
  where me.event_name = 'onboarding_completed'
    and me.checkout_attempt_id = '8d100000-0000-4000-8000-000000000001'
  limit 1;
  if v_event_text like '%8a100000-0000-4000-8000-000000000001%'
     or v_event_text like '%8b100000-0000-4000-8000-000000000001%' then
    raise exception 'marketing lifecycle runtime assertion failed: lifecycle event leaked user/shop identity';
  end if;
end
$$;

rollback;
'''
Path('tests/security/marketing-lifecycle-conversion.runtime.sql').write_text(runtime)

workflow_path = Path('.github/workflows/supabase-clean-replay-audit.yml')
workflow = workflow_path.read_text()
anchor = '''      - name: Execute Early Access discount grant integration\n'''
insert = '''      - name: Execute marketing lifecycle conversion integration\n        shell: bash\n        env:\n          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres\n        run: |\n          set -euo pipefail\n          if ! command -v psql >/dev/null 2>&1; then\n            sudo apt-get update\n            sudo apt-get install -y postgresql-client\n          fi\n          psql "$DB_URL" -X -v ON_ERROR_STOP=1 \\\n            -f tests/security/marketing-lifecycle-conversion.runtime.sql \\\n            2>&1 | tee marketing-lifecycle-conversion-runtime.log\n\n'''
if anchor not in workflow:
    raise SystemExit('clean replay insertion anchor not found')
workflow_path.write_text(workflow.replace(anchor, insert + anchor, 1))
