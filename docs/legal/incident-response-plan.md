# ProFixIQ Incident Response Plan (DRAFT — internal operational document)

**Last updated:** [date]

This plan describes how ProFixIQ detects, triages, contains, and
communicates security incidents affecting Shop Data. It supports the
notification commitments in the Data Processing Addendum (Section 7)
and Privacy Policy.

## 1. Definitions

A **security incident** is any confirmed or reasonably suspected event
that compromises the confidentiality, integrity, or availability of
Shop Data or ProFixIQ production systems, including unauthorized
access, data exposure (e.g., a misconfigured public bucket or grant),
credential compromise, or a successful exploit of a vulnerability.

## 2. Roles

| Role | Responsibility |
|---|---|
| Incident Commander | Owns the response end-to-end; declares severity and stand-down |
| Technical Lead | Diagnoses root cause, implements containment/fix |
| Communications Lead | Drafts internal and customer/Shop notifications |
| [Legal/Privacy contact] | Determines legal notification obligations by jurisdiction |

At current company size, one person may hold multiple roles; this table
should be updated as the team grows.

## 3. Severity levels

- **SEV-1 (Critical):** Active data exposure or breach affecting
  multiple Shops, or a compromise of production credentials/infrastructure.
- **SEV-2 (High):** Confirmed vulnerability with realistic exploit path
  but no confirmed exposure yet, or exposure limited to a single Shop.
- **SEV-3 (Moderate):** Misconfiguration or weakness identified
  proactively (e.g., via security advisor scan) with no evidence of
  exploitation.

## 4. Response steps

1. **Detect** — via automated advisories (e.g., database security
   linter), monitoring/alerting, user report, or security research
   disclosure.
2. **Triage** — assign severity within [1 hour] of detection for SEV-1/2.
3. **Contain** — revoke/rotate compromised credentials, patch the
   vulnerability, or remove public access, prioritizing stopping
   ongoing exposure over full root-cause analysis.
4. **Investigate** — determine scope: which Shops/records were
   accessible, whether access logs show actual (not just possible)
   unauthorized access, and root cause.
5. **Notify** —
   - Affected Shops: without undue delay, and in any case within the
     DPA's [72-hour] commitment for confirmed breaches, with what
     happened, what data was involved, and what to do.
   - Regulators/individuals: as required by applicable law, coordinated
     with the Shop where ProFixIQ is a processor.
6. **Remediate** — implement the permanent fix, not just the
   containment step, and add a regression test/advisory check where
   practical.
7. **Post-incident review** — document timeline, root cause, and
   follow-up actions within [5 business days] of resolution.

## 5. Communication templates

[To be drafted: a Shop-facing breach notification template and an
internal escalation template.]

## 6. Testing

This plan should be reviewed at least [annually] and after any SEV-1/2
incident, and ideally exercised via a tabletop scenario before the
first real incident.

---

*This is an internal operational document, not a customer-facing legal
document, though its notification commitments are referenced by the
DPA and should stay consistent with it.*
