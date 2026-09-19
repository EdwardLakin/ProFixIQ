# ProFixIQ Security Policy (DRAFT — verify against current state before publishing)

**Last updated:** [date]

This document summarizes the technical and organizational security
measures ProFixIQ maintains to protect Shop Data. It supports the
Terms of Service and Data Processing Addendum and will anchor a future
public Trust Center summary.

## 1. Tenant isolation

Shop data is isolated at the database layer using Postgres row-level
security (RLS) policies scoped to shop membership, enforced on
essentially all core tenant tables. Access to another shop's data
requires either a policy-granted role match or an explicitly audited,
narrowly-scoped privileged function.

## 2. Least-privilege access

- Application database roles (`anon`, `authenticated`) are granted
  execute access only to the functions the application actually calls,
  reviewed and pruned from an initially over-broad default.
- Production infrastructure access (database, hosting, billing) is
  limited to personnel who need it for their role.

## 3. Encryption

Data is encrypted in transit via TLS for all client-server and
server-to-subprocessor connections. Data at rest is encrypted using our
database and storage providers' standard encryption.

## 4. Application security controls

- A Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, and Permissions-Policy are enforced at the application
  layer.
- Stripe handles payment card data directly; ProFixIQ does not receive
  or store full card numbers.
- [Confirm and add: dependency/vulnerability scanning, static analysis,
  and secret-scanning coverage once implemented in CI.]

## 5. Authentication

- Passwords are managed by our authentication provider (Supabase Auth)
  with leaked-password protection [confirm enabled] and standard
  hashing.
- Multi-factor authentication [confirm current state / add roadmap: is
  planned for administrative and financial roles].

## 6. Monitoring and logging

Production error and access logs are monitored for anomalies.
Signature/inspection evidence records are cryptographically hashed
(SHA-256) at finalization to detect tampering.

## 7. Vulnerability management

Security advisories from our database provider are reviewed regularly,
and identified issues are prioritized by severity. [Confirm and add:
patch/upgrade cadence for the underlying database engine once a formal
schedule exists.]

## 8. Responsible disclosure

Security researchers may report suspected vulnerabilities to [security
contact email]. We ask researchers not to access, modify, or exfiltrate
data beyond what is needed to demonstrate an issue, and we will
acknowledge reports within [X] business days. [Publish a full
Responsible Disclosure Policy before inviting external testing.]

## 9. Incident response

See the Incident Response Plan for how ProFixIQ detects, contains, and
discloses security incidents.

---

*This document is a first draft and contains claims that must be
verified against the current production configuration (especially
Sections 5 and 7) before publishing. It is not legal advice.*
