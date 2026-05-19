# Step 19B: Property Request Attachments (Internal-Only Upload Plan)

## Findings from existing storage patterns

- Property request attachments currently store metadata only; runtime upload is not wired yet.
- Existing property request UI explicitly labels attachments as placeholders.
- Repo currently uses Supabase Storage uploads in isolated features, but no existing bucket/policy setup was found for property request attachments.

## Bucket plan

- **Bucket id/name:** `property_request_attachments`
- **Visibility:** private (`public = false`)
- **Allowed mime types:** `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`
- **File size limit (draft):** 10 MB
- **Object path convention (required):**
  - `<shop_id>/property-requests/<request_id>/<timestamp>-<random>-<sanitized_filename>`

This path convention enables RLS checks against the caller's `profiles.shop_id` without service-role usage.

## Storage policy draft

- Manual SQL draft is provided in:
  - `supabase/manual/property-request-attachments-storage-step-19b.sql`
- Policies are scoped to `authenticated` users and enforce:
  - `bucket_id = 'property_request_attachments'`
  - first path segment matches `profiles.shop_id`

## Runtime gating

Per rollout constraints:

- Do **not** wire runtime upload until this bucket + policies are applied in the target Supabase project.
- Do **not** use service role in runtime.
- Do **not** create buckets automatically in runtime.

## Next implementation step (after manual setup is applied)

1. Replace placeholder form on `/property/requests/[id]` with internal image upload form.
2. Upload image via user-scoped Supabase client to `property_request_attachments`.
3. Insert `property_request_attachments` metadata:
   - `storage_bucket`
   - `storage_path`
   - `size_bytes`
   - `content_type`
   - `original_filename`
4. Create `attachment_added` timeline event.
5. Render linked attachments as internal file/image links on request detail.
