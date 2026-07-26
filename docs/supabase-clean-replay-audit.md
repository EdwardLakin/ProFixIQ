# Supabase clean replay audit

The clean replay is a permanent release gate. Its canonical operating and
recovery instructions are in
[Supabase recovery and schema contract](./supabase-recovery-and-schema-contract.md).

The validation workflow must continue to prove both guarded baseline modes,
replay every forward migration, run the P0 database authorization tests, and
diff locally generated types against the committed contract.
