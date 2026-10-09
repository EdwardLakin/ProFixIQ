create index if not exists email_logs_portal_invite_delivery_idx
  on public.email_logs (
    shop_id,
    to_email,
    (metadata ->> 'customer_portal_invite_id'),
    created_at desc
  )
  where template_key = 'portal_invite';

create index if not exists email_logs_portal_invite_attempt_idx
  on public.email_logs (
    shop_id,
    to_email,
    (metadata ->> 'customer_portal_invite_attempt_id'),
    created_at desc
  )
  where template_key = 'portal_invite';
