# SendGrid delivery webhook

ProFixIQ records SendGrid acceptance synchronously and records final delivery
events through a signed webhook.

## Required configuration

1. Apply `20260716120000_sendgrid_delivery_events.sql`.
2. In SendGrid, create an Event Webhook with this production URL:
   `https://profixiq.com/api/webhooks/sendgrid/events`.
3. Enable signature verification.
4. Subscribe to processed, delivered, deferred, bounce, dropped, open, click,
   spam report, and unsubscribe events.
5. Store SendGrid's verification public key in the deployment environment as
   `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`. PEM and base64 DER forms are accepted.
6. Send a SendGrid test event and confirm the endpoint returns HTTP 200.

## Operational behavior

- A successful Mail Send API response is recorded as `accepted`, not delivered.
- Signed webhook events advance the delivery status and are deduplicated by
  SendGrid event ID.
- Bounce, spam-report, and global unsubscribe events add the recipient to
  `email_suppressions`.
- Suppressed recipients are not sent another dynamic-template email.
- Email-log metadata is scrubbed of links, tokens, passwords, and cookies.

Do not place customer data, URLs, access tokens, or message content in SendGrid
custom arguments. ProFixIQ sends only the opaque email-log ID for correlation.
