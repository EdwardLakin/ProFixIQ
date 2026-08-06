# Supabase migration reconciliation — 2026-08-06

This repair is forward-only. No applied migration is edited, renamed, or
reordered. `supabase/migrations/` remains the deployable source of truth, and
migration-history repair is used only after the corresponding SQL effects are
verified in PostgreSQL.

## Repair migrations

| Migration                                                     | Purpose                                                                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260806181455_reconcile_production_billing_protections.sql` | Promotes the four production-only billing entitlement hotfixes into repository history, including the final generated-`max_users` guard fix. |
| `20260806181502_restore_fleet_owned_unit_enrollment.sql`      | Re-applies Fleet-owned unit enrollment through a new forward migration because production missed `20260806021000`.                           |
| `20260806181508_retire_legacy_bootstrap_schema_aliases.sql`   | Preserves and retires the 17 clean-replay-only bootstrap aliases, then verifies the two overloaded Parts functions directly in PostgreSQL.   |
| `20260806181742_reconcile_migration_alias_effects.sql`        | Adds the one effect missing from the non-identical invoice alias, normalizes bridge RLS, and validates any configured agent-bridge row.      |

## Seventeen-column classification

All 17 columns are intentionally retired aliases. Current application code
uses the production-side contract shown below. The cleanup migration preserves
legacy values before dropping a column whenever the value has business meaning.

| Clean-replay-only column                    | Classification and preservation                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `demo_shop_boosts.updated_at`               | Retired unused audit alias; `created_at` remains authoritative.                                                   |
| `email_logs.email`                          | Retired; backfilled into `to_email`.                                                                              |
| `email_logs.error`                          | Retired; backfilled into `error_text`.                                                                            |
| `email_logs.event_type`                     | Retired webhook alias; backfilled into `last_event_type`.                                                         |
| `email_logs.sg_event_id`                    | Retired; preserved as `metadata.legacy_sg_event_id`. Canonical webhook events live in `email_delivery_events`.    |
| `email_logs.timestamp`                      | Retired; backfilled into `last_event_at`.                                                                         |
| `fleet_members.id`                          | Retired synthetic key. Memberships use profile IDs and primary key `(fleet_id, user_id)`.                         |
| `invoices.due_at`                           | Retired timestamp alias; backfilled into canonical `due_date` using UTC.                                          |
| `messages.chat_id`                          | Retired legacy chat path; preserved as `metadata.legacy_chat_id`. Current messaging uses `conversation_id`.       |
| `payments.invoice_id`                       | Retired; preserved in metadata. It is not guessed into an immutable invoice version.                              |
| `payments.payment_method`                   | Retired; preserved in payment metadata. Canonical receipts/payment events own the method.                         |
| `payments.processor`                        | Retired; preserved in payment metadata.                                                                           |
| `payments.processor_payment_id`             | Retired; preserved in metadata. A generic processor ID is not assumed to be a Stripe payment intent.              |
| `work_order_lines.void_note`                | Retired duplicate; backfilled into `voided_note`.                                                                 |
| `work_order_lines.void_reason`              | Retired duplicate; backfilled into `voided_reason`. The atomic line-void RPC is patched before removal.           |
| `work_order_quote_lines.inspection_item_id` | Retired unused anchor; preserved in metadata. Current estimate lineage uses canonical source fields and metadata. |
| `work_order_quote_lines.menu_item_id`       | Retired unused anchor; preserved in metadata.                                                                     |

## Function classification

The two functions reported as missing are required and already exist in
production:

| Function                                                     | Classification | Evidence                                                                                  |
| ------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `can_update_part_request_items(uuid)`                        | Required       | Used by active `part_request_items` update policies and estimate workflow migrations.     |
| `receive_part_request_item(uuid, uuid, numeric, uuid, text)` | Required       | Called by the Parts receiving API and granted only to `authenticated` and `service_role`. |

Both names are overloaded in production. A linked type export can omit one
overload, so type-file presence is not valid function-existence evidence. The
forward migration and runtime test use `to_regprocedure(...)` instead.

## Production-only history classification

| Production history row(s)                                              | Classification                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `20260803012030 repair_operational_event_semantics_runtime`            | Absorbed. Its actor, event-time, and semantic idempotency effects are already owned by `20260802154501` and `20260802161000`. |
| `20260805161148`, `20260805162053`, `20260805162303`, `20260805162544` | Promoted. Only their final billing state is retained in `20260806181455`; superseded intermediate guards are not copied.      |
| `20260805214850`, `20260805215044`                                     | Intentionally retired, net-zero agent-bridge probe pair. The probe function is absent.                                        |

## Timestamp-alias proof

There are 23 logical repository migrations recorded under execution-time
timestamps in production. Twenty migrations have byte-for-byte SQL equivalence
after whitespace normalization. Two agent-bridge migrations each have two
production executions; together they produce the repository migration's final
state. `harden_invoice_ai_contracts` is intentionally not ledger-marked as
applied: its repository file gained the QuickBooks `invoice_version` effect
after the production execution and must run once.

| Repository version | Production version(s)              | Proof                                                                                                                                                                                    |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260803023000`   | `20260803030452`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260803023100`   | `20260803031935`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260803023200`   | `20260803032042`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260803023300`   | `20260803032139`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260803023400`   | `20260803032327`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260803034531`   | `20260804040553`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260803041000`   | `20260803040617`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260803174543`   | `20260804012728`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260803193215`   | `20260804014907`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260804031005`   | `20260804040625`                   | Not equivalent; apply repository version. Missing QuickBooks effect is also asserted by the new postcondition migration.                                                                 |
| `20260805050000`   | `20260805125338`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260805134500`   | `20260805133714`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260805135500`   | `20260805134958`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260805143000`   | `20260805143055`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260805145119`   | `20260805161007`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260805162923`   | `20260805164708`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260805185619`   | `20260805195819`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260805200003`   | `20260805200108`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260805202500`   | `20260805202529`, `20260805214757` | First execution matches; duplicate has the same table/ACL effects.                                                                                                                       |
| `20260805202600`   | `20260805204119`, `20260805214807` | Composite executions migrated the secret into `integrations` and dropped the credential table. The forward repair converges clean RLS on production's narrower `authenticated` policies. |
| `20260806022000`   | `20260806044337`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260806022431`   | `20260806044348`                   | Normalized SQL hash match                                                                                                                                                                |
| `20260806063000`   | `20260806064153`                   | Normalized SQL hash match                                                                                                                                                                |

## Production execution gate

Do not run these commands until the PR's clean replay, runtime SQL, generated
type diff, typecheck, lint, tests, and build have passed on one commit.

1. Verify a current recoverable database backup.
2. Re-query the production SQL effects: the legacy bridge table must be absent,
   the canonical bridge row must be well-formed without returning its secret,
   the four integration policies must target `authenticated`, and all billing
   guard functions/triggers must match the runtime postconditions.
3. Mark the 22 effect-equivalent repository versions as `applied` with the
   exact command below. This edits the ledger only; it does not run their SQL.

   ```sh
   supabase migration repair --linked --status applied \
     20260803023000 20260803023100 20260803023200 20260803023300 \
     20260803023400 20260803034531 20260803041000 20260803174543 \
     20260803193215 20260805050000 20260805134500 20260805135500 \
     20260805143000 20260805145119 20260805162923 20260805185619 \
     20260805200003 20260805202500 20260805202600 20260806022000 \
     20260806022431 20260806063000
   ```

4. Mark all 25 execution-time aliases as `reverted`, including the
   non-equivalent `20260804040625` alias. The local `20260804031005` version is
   deliberately not marked applied, so its additional SQL effect can execute.

   ```sh
   supabase migration repair --linked --status reverted \
     20260803030452 20260803031935 20260803032042 20260803032139 \
     20260803032327 20260804040553 20260803040617 20260804012728 \
     20260804014907 20260804040625 20260805125338 20260805133714 \
     20260805134958 20260805143055 20260805161007 20260805164708 \
     20260805195819 20260805200108 20260805202529 20260805214757 \
     20260805204119 20260805214807 20260806044337 20260806044348 \
     20260806064153
   ```

5. Mark the seven production-only rows classified above as `reverted`.

   ```sh
   supabase migration repair --linked --status reverted \
     20260803012030 20260805161148 20260805162053 20260805162303 \
     20260805162544 20260805214850 20260805215044
   ```

6. Run `supabase migration list --linked` and save the result. Leave
   `20260804031005` and `20260806021000` unapplied so their SQL executes.
7. Run `supabase db push --linked --include-all --dry-run`. The only pending
   versions must be `20260804031005`, `20260806021000`, and the four repair
   migrations listed above.
8. Run `supabase db push --linked --include-all` once.
9. Re-run migration-list comparison, generated linked types, runtime
   postconditions, and Supabase security/performance advisors.

Migration repair changes only `supabase_migrations.schema_migrations`; it does
not execute SQL and must never substitute for the schema checks above.
