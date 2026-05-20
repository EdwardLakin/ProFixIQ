# Property Inspection Signatures / Acknowledgements (Step 24A)

## Purpose
This step defines a **manual SQL draft** for adding signature/acknowledgement support to property inspections without wiring runtime code yet.

The scope is to support signing and acknowledgements for:
- move-in inspections
- move-out inspections
- periodic inspections
- maintenance follow-up inspections

## What this draft adds
- A new table: `public.property_inspection_signatures`.
- Signature actor metadata (`signer_name`, `signer_email`, `signer_role`, optional `signer_profile_id`).
- Signature method metadata (`signature_type`, `signature_text`, `signature_image_path`).
- Audit metadata (`signed_at`, `ip_address`, `user_agent`, `metadata`, `created_at`).
- Tenant-safe linkage to inspections via `shop_id` and `inspection_id`.
- RLS policies for internal staff and scoped property members.

## Signature roles covered
Allowed `signer_role` values:
- `tenant`
- `property_manager`
- `owner`
- `internal`
- `witness`

This supports common move-in/move-out flows where both tenant and property manager signatures are needed for condition confirmation.

## Signature types covered
Allowed `signature_type` values:
- `typed`
- `drawn`
- `uploaded`
- `acknowledged`

Step 24A implementation path is focused on `typed` and `acknowledged` first.

`drawn` and `uploaded` are included now as forward-compatible enums, but runtime capture/upload is not introduced in this step.

## Data integrity + constraints
The SQL draft includes:
- required `signed_at` and `signer_name`
- check constraints for valid `signer_role` and `signature_type`
- payload rule: `signature_text` or `signature_image_path` is required unless `signature_type = 'acknowledged'`
- trigger enforcement so `property_inspection_signatures.shop_id` must match `property_inspections.shop_id`

## RLS model (draft)
RLS is enabled on `public.property_inspection_signatures` with policies for:
- internal staff select/insert/update/delete scoped by profile `shop_id`
- property members select signatures for inspections within membership scope
- property members insert only their own signatures (`signer_profile_id = auth.uid()`) within membership scope

No public unauthenticated signing is included.
No vendor signing is included.

## Explicit non-goals in Step 24A
- No runtime wiring (no API/controller/UI changes)
- No image upload bucket creation for signature capture
- No service-role-based signing paths
- No quote flow integration
- No auth model changes

## Files
- `supabase/manual/property-inspection-signatures-step-24a.sql`
- `docs/plans/property-inspection-signatures-step-24a.md`
