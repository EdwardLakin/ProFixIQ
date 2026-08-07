# Agent production readiness runbook

This runbook covers the production boundary between the ProFixIQ application and the private ProFixIQ-Agent service. It is intended for releases, incident response, and credential rotation. Never paste secret values into tickets, pull requests, logs, or command output.

## Production contract

- The ProFixIQ Agent console is the human approval surface. A developer-authorized ProFixIQ user must review the complete mission contract before mission approval is enabled.
- ProFixIQ calls the private Agent service through the canonical server client in `features/agent/server/teamClient.ts`.
- Agent callbacks use authenticated internal ProFixIQ routes. The approval-proof consumer is `POST /api/internal/agent/approval-intents/consume`.
- Human approval is represented by a short-lived, one-time proof. The raw proof is never stored; only its SHA-256 digest is persisted.
- The approval proof is bound to the approval kind, approving user, engineering case, and mission when the approval is for a mission. It expires after three minutes and can be consumed only once.
- `agent_human_approval_intents` and `consume_agent_human_approval_intent(...)` are service-role-only. RLS remains enabled, and `anon` and `authenticated` have neither table access nor function execution.
- The Agent service must keep legacy direct production actions disabled. All production work remains subject to the canonical mission and human-release gates.

## Required configuration

ProFixIQ server configuration uses the existing variables below:

- `PROFIXIQ_AGENT_URL`
- `AGENT_API_SECRET`
- `PROFIXIQ_AGENT_API_SECRET` (supported compatibility alias)
- `INTERNAL_AGENT_SECRET` (supported compatibility alias)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

At least one configured Agent API secret or the enabled database bridge credential must be available to the ProFixIQ server client. The canonical secret name for new configuration is `AGENT_API_SECRET`; aliases exist for compatibility and must not be introduced into new code without a migration plan.

The database bridge credential is stored in the global `integrations` row whose kind is `profixiq_agent_bridge`. It must remain enabled, global (`shop_id is null`), and inaccessible to browser clients. Rotate the Agent-side value and the ProFixIQ-side value together.

## Deployment order

1. Apply the Supabase migration that creates `agent_human_approval_intents`, its indexes, and the atomic consume function.
2. Verify generated Supabase types match the deployed schema.
3. Deploy ProFixIQ-Agent and wait for its production deployment to be ready.
4. Run the authenticated Agent readiness probe and require every dependency to report `ok: true`.
5. Deploy ProFixIQ and wait for the exact main-branch commit to be ready and aliased to the production domains.
6. Exercise the public app and the negative-auth probes below.
7. Confirm the exact production deployments have no new runtime error clusters or 5xx responses.

Do not drop the approval-intent table or function during an application rollback. Older application code can ignore the additive schema, while removing it first can break the secured approval flow during a rolling deployment.

## Required release gate

The required `Agent PR Checks` workflow must pass on the exact pull-request head. It runs:

- full TypeScript type-checking;
- ESLint for changed JavaScript and TypeScript files;
- the complete Vitest suite; and
- a production Next.js build with compile-only placeholder configuration.

A Vercel status badge alone is not sufficient evidence because a preview deployment can be canceled or superseded. Verify the deployment object for the exact commit is `READY`.

## Production verification

Run secret-bearing commands only from an approved secret-aware environment. The examples intentionally reference environment-variable names and never print their values.

### Public application

```bash
curl --fail --silent --show-error --location https://profixiq.com/ > /dev/null
```

Expected result: HTTP 200 from the production deployment.

### Agent readiness authentication

```bash
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  https://pro-fix-iq-agent.vercel.app/ready
```

Expected result without credentials: HTTP 403.

```bash
curl --fail --silent --show-error \
  --header "x-agent-api-secret: ${AGENT_API_SECRET}" \
  https://pro-fix-iq-agent.vercel.app/ready
```

Expected authenticated result: HTTP 200, top-level `ok: true`, and `ok: true` for environment, OpenAI, Supabase, GitHub, API rate limiting, operations authentication, database evidence, pull-request gates, Vercel runtime evidence, worker registry, and legacy-direct-action safety.

### Approval consumer authentication

```bash
curl --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --data '{}' \
  https://profixiq.com/api/internal/agent/approval-intents/consume
```

Expected result without credentials: HTTP 401 and `{"valid":false}`.

### Database security contract

Run this read-only check in the production Supabase project:

```sql
select
  to_regclass('public.agent_human_approval_intents') is not null as table_exists,
  to_regprocedure(
    'public.consume_agent_human_approval_intent(text,text,uuid,uuid,uuid)'
  ) is not null as function_exists,
  (select relrowsecurity
     from pg_class
    where oid = 'public.agent_human_approval_intents'::regclass) as rls_enabled,
  has_table_privilege(
    'anon', 'public.agent_human_approval_intents', 'SELECT'
  ) as anon_can_select,
  has_table_privilege(
    'authenticated', 'public.agent_human_approval_intents', 'SELECT'
  ) as authenticated_can_select,
  has_function_privilege(
    'anon',
    'public.consume_agent_human_approval_intent(text,text,uuid,uuid,uuid)',
    'EXECUTE'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    'public.consume_agent_human_approval_intent(text,text,uuid,uuid,uuid)',
    'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'service_role',
    'public.consume_agent_human_approval_intent(text,text,uuid,uuid,uuid)',
    'EXECUTE'
  ) as service_role_can_execute;
```

Expected result: table and function present, RLS enabled, anonymous and authenticated access false, and service-role function execution true.

## Incident response

If authenticated readiness is not fully green:

1. Stop approvals and releases; do not bypass the human gates.
2. Identify the failing dependency in `/ready` without logging credentials or the full request headers.
3. Inspect the exact Agent and ProFixIQ production deployment IDs and their runtime error clusters.
4. Verify the global bridge integration is enabled and correctly typed without selecting or printing its secret.
5. Verify production migration state and the database privilege contract.
6. Roll back the failing application deployment if necessary, but retain the additive approval-intent schema.
7. After repair, repeat authenticated readiness, negative-auth probes, database checks, and runtime telemetry checks before resuming approvals.

Existing unconsumed proofs expire after three minutes. A replayed, expired, mismatched, or already consumed proof must return `valid: false`; never extend a proof or mark it consumed manually to recover an approval.
