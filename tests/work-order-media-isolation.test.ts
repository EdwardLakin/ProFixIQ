import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const migration = readFileSync(
  "supabase/migrations/20260825220000_isolate_work_order_media_storage.sql",
  "utf8",
);
const runtime = readFileSync(
  "tests/security/work-order-media-isolation.runtime.sql",
  "utf8",
);
const evidenceAuthorization = readFileSync(
  "features/work-orders/server/authorizeWorkOrderEvidence.ts",
  "utf8",
);
const mediaRoute = readFileSync(
  "app/api/work-orders/[id]/media/route.ts",
  "utf8",
);
const photoUploadRoute = source("app/api/inspections/photos/upload/route.ts");
const quoteReview = source(
  "features/work-orders/quote-review/QuoteReviewView.tsx",
);
const quoteEvidenceSigner = source(
  "app/api/work-orders/[id]/quote-evidence/sign/route.ts",
);

describe("Work Order evidence and job-photo isolation", () => {
  it("removes the drifted broad media reader and resolves both staff identity shapes", () => {
    expect(migration).toContain(
      "drop policy if exists work_order_media_select on public.work_order_media",
    );
    expect(migration).toContain("profile.id = auth.uid()");
    expect(migration).toContain("profile.user_id = auth.uid()");
    expect(migration).toContain(
      "public.canonical_shop_membership_role(profile.role::text)",
    );
    expect(migration).toContain("wo.shop_id = work_order_media.shop_id");
    expect(migration).toContain(
      "public.profixiq_is_portal_customer_for(\n          wo.customer_id,",
    );
    expect(runtime).toContain(
      "then '57100000-0000-4000-8000-000000000002'::uuid",
    );
    expect(evidenceAuthorization).toContain("resolveCanonicalStaffProfile");
    expect(migration).toContain(
      "alter function public.validate_work_order_media_scope() security definer",
    );
    expect(migration).toContain(
      "revoke all on function public.validate_work_order_media_scope()",
    );
    expect(migration).toContain(
      "alter function public.validate_work_order_media_scope() set search_path = ''",
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role;",
    );
    expect(runtime).toContain("and validator.prosecdef");
    expect(runtime).toContain(
      "validator.proconfig @> array['search_path=\"\"']::text[]",
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(runtime).toContain(
        `'${role}',\n    'public.validate_work_order_media_scope()',`,
      );
    }
    expect(runtime).toContain(
      "Imported technician inserted cross-Shop Work Order media.",
    );
  });

  it("binds every private storage operation to a canonical tenant path and actor", () => {
    expect(migration).toContain(
      "create or replace function private.job_photo_object_access",
    );
    expect(migration).toContain(
      "'^wo/([0-9a-fA-F-]{36})/lines/([0-9a-fA-F-]{36})/([^/]+)$'",
    );
    expect(migration).toContain("line.work_order_id = wo.id");
    expect(migration).toContain("line.shop_id = wo.shop_id");
    expect(migration).toContain("v_owner_user_id = v_actor_user_id");
    expect(migration).toMatch(
      /create or replace function private\.job_photo_object_access[\s\S]*?language plpgsql\s+volatile\s+security definer/,
    );

    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(
        `drop policy if exists job_photos_${operation}`,
      );
      expect(migration).toContain(`'${operation}'`);
      expect(migration).toContain(
        `create policy job_photos_${operation}_boundary`,
      );
    }
    expect(migration).toContain("as restrictive");
    expect(migration).toContain("drop_legacy_job_photo_policies");
    expect(runtime).toContain("media_runtime_drift_job_photo_insert");
  });

  it("signs private inspection photos through the current authorized session", () => {
    const signer = source(
      "features/inspections/server/signInspectionPhotoRows.ts",
    );
    const load = source("app/api/inspections/load/route.ts");
    const portalQuote = source("app/api/portal/quotes/[id]/route.ts");

    expect(signer).toContain('object.bucket !== "job-photos"');
    expect(signer).toContain("args.sessionClient.storage");
    expect(signer).toContain(".createSignedUrl(object.path, expiresIn)");
    expect(signer).toContain("error || !data?.signedUrl ? null");
    expect(load).toContain("signInspectionPhotoRows");
    expect(load).toContain("rows: canonicalPhotos");
    expect(portalQuote).toContain("signInspectionPhotoRows");
    expect(portalQuote).toContain("rows: data ?? []");
  });

  it("makes the established job-photo bucket private", () => {
    expect(migration).toMatch(
      /update storage\.buckets\s+set public = false\s+where id = 'job-photos'\s+and public is distinct from false;/,
    );
    expect(runtime).toContain("Job-photo bucket is not private.");
  });

  it("keeps customer storage reads visibility- and ownership-scoped", () => {
    const helper = migration.slice(
      migration.indexOf(
        "create or replace function private.job_photo_object_access",
      ),
      migration.indexOf(
        "revoke all on function private.job_photo_object_access",
      ),
    );

    expect(helper).toContain("media.visibility = 'customer'");
    expect(helper).toContain("public.profixiq_is_portal_customer_for(");
    expect(helper).toContain("membership.user_id = v_actor_user_id");
    expect(helper).toContain("media.storage_path = p_name");
    expect(runtime).toContain(
      "Revoked customer retained Work Order evidence access.",
    );
  });

  it("promotes the canonical path-backed row before portal signing", () => {
    expect(migration).toContain(
      "create or replace function private.job_photo_path_from_locator",
    );
    expect(migration).toContain(
      "canonical.storage_path = private.job_photo_path_from_locator(promoted.url)",
    );
    expect(migration).toContain(
      "v_storage_path := private.job_photo_path_from_locator(v_url)",
    );
    expect(migration).toContain("set visibility = 'customer'");
  });

  it("compensates an uploaded object when atomic attachment loses authority", () => {
    expect(photoUploadRoute).toContain(
      "async function compensateWorkOrderPhotoUpload",
    );
    expect(photoUploadRoute).toContain('.from("job-photos")');
    expect(photoUploadRoute).toContain(".remove([args.path])");
    expect(photoUploadRoute).toContain('.from("work_order_media")');
    expect(photoUploadRoute).toContain("uploadedThisRequest");
    expect(photoUploadRoute).toMatch(
      /savedError\.code === "42501"[\s\S]*?compensateWorkOrderPhotoUpload/,
    );
  });

  it("re-signs staff Quote Review evidence through an authorized route", () => {
    expect(quoteReview).toContain("signQuoteEvidence");
    expect(quoteReview).toContain("/quote-evidence/sign");
    expect(quoteEvidenceSigner).toContain("requireShopScopedApiAccess");
    expect(quoteEvidenceSigner).toContain("signInspectionPhotoRows");
  });

  it("binds every customer evidence read path to active portal access", () => {
    const mediaPolicy = migration.slice(
      migration.indexOf("create policy work_order_media_shop_select"),
      migration.indexOf("drop policy if exists work_order_media_shop_insert"),
    );
    const annotationPolicy = migration.slice(
      migration.indexOf("create policy work_order_media_annotations_select"),
      migration.indexOf(
        "create or replace function public.save_work_order_media_annotation_atomic",
      ),
    );

    for (const policy of [mediaPolicy, annotationPolicy]) {
      expect(policy).toContain("public.profixiq_is_portal_customer_for(");
      expect(policy).not.toContain("customer.user_id = auth.uid()");
    }
    expect(evidenceAuthorization).toContain(
      'sessionClient.rpc("profixiq_is_portal_customer_for"',
    );
    expect(mediaRoute.indexOf("authorizeWorkOrderEvidence")).toBeLessThan(
      mediaRoute.indexOf("const admin = createAdminSupabase()"),
    );
  });

  it("binds every media write to the exact repair-line assignment", () => {
    const access = migration.slice(
      migration.indexOf(
        "create or replace function private.work_order_media_write_access",
      ),
      migration.indexOf(
        "revoke all on function private.work_order_media_write_access",
      ),
    );
    const writer = migration.slice(
      migration.indexOf(
        "create or replace function public.save_work_order_media_annotation_atomic",
      ),
      migration.indexOf(
        "revoke all on function public.save_work_order_media_annotation_atomic",
      ),
    );

    expect(access).toContain("v_actor_user_id uuid := auth.uid()");
    expect(access).toContain("profile.user_id = v_actor_user_id");
    expect(access).toContain("for update;");
    expect(access).toContain("line.assigned_tech_id in (");
    expect(access).toContain("line.assigned_to in (");
    expect(access).toContain("public.work_order_line_technicians assignment");
    expect(access).toMatch(/language plpgsql\s+volatile\s+security definer/);
    expect(writer).toContain("private.work_order_media_write_access(");
    expect(writer).toContain("v_existing.created_by <> v_actor_user_id");
    expect(writer).toContain("v_actor_user_id,");
    expect(
      writer.indexOf("private.work_order_media_write_access("),
    ).toBeLessThan(
      writer.indexOf("client_mutation_id = btrim(p_client_mutation_id)"),
    );
    expect(runtime).toContain(
      "Imported technician wrote storage for an unassigned repair line.",
    );
    expect(runtime).toContain(
      "Imported technician wrote media for an unassigned repair line.",
    );
    expect(runtime).toContain(
      "Reassigned technician replayed an annotation receipt.",
    );
    expect(runtime).toContain(
      "Reassigned technician updated prior Work Order media.",
    );
    expect(mediaRoute).toContain('error.code === "42501" ? 403 : 400');
    expect(mediaRoute).toContain(
      "const { data: updatedMedia, error } = await session",
    );
    expect(mediaRoute).toContain('.select("id")');
    expect(mediaRoute).toContain("if (!updatedMedia?.id)");
  });

  it("removes anonymous media grants and leaves only intended browser writes", () => {
    expect(migration).toContain(
      "revoke all on table public.work_order_media\n  from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update on table public.work_order_media\n  to authenticated",
    );
    expect(runtime).toContain("Parts inserted Work Order media.");
  });
});
