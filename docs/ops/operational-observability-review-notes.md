# Operational Observability Review Notes

## Reviewer focus

1. Confirm all new schema work is additive and forward-only.
2. Confirm `operational_events` and `operational_event_failures` remain tenant-scoped and non-mutable by authenticated clients.
3. Confirm event capture never blocks the authoritative business write.
4. Confirm the three hardening migrations apply in timestamp order.
5. Confirm the service-role health projection is not callable by anonymous or authenticated roles.
6. Confirm owner/admin/manager are the only roles with shop-wide observability access.
7. Confirm work-order timelines use canonical work-order correlation IDs.
8. Confirm the hourly cron preserves acknowledged alerts and does not send external communications.
9. Confirm branch deployments remain disabled.
10. Do not apply migrations to production or merge without explicit approval.
