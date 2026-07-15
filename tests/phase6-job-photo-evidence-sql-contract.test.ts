import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260715070200_phase6_canonical_job_photo_evidence.sql",
  "utf8",
);
const postcheck = readFileSync(
  "supabase/migrations/20260715070300_phase6_mobile_reliability_postcheck.sql",
  "utf8",
);
const mobileJob = readFileSync(
  "features/work-orders/mobile/MobileFocusedJob.tsx",
  "utf8",
);
const desktopJob = readFileSync(
  "features/work-orders/components/workorders/FocusedJobModal.tsx",
  "utf8",
);

describe("Phase 6 canonical job-photo evidence", () => {
  it("registers existing job-photos uploads as canonical work_order_media", () => {
    expect(migration).toContain("register_job_photo_storage_object");
    expect(migration).toContain("trg_register_job_photo_storage_object");
    expect(migration).toContain("new.bucket_id = 'job-photos'");
    expect(migration).toContain("insert into public.work_order_media");
    expect(migration).toContain("'technician_job_photo'");
  });

  it("validates the work-order and line anchor before persistence", () => {
    expect(migration).toContain("JOB_PHOTO_WORK_ORDER_LINE_MISMATCH");
    expect(migration).toContain("WORK_ORDER_MEDIA_LINE_SCOPE_MISMATCH");
    expect(migration).toContain("wol.work_order_id = wo.id");
    expect(migration).toContain("wol.shop_id = wo.shop_id");
  });

  it("deduplicates storage retries", () => {
    expect(migration).toContain("uq_work_order_media_storage_object");
    expect(migration).toContain("on conflict (shop_id, storage_bucket, storage_path)");
    expect(migration).toContain("client_mutation_id");
  });

  it("covers both existing mobile and desktop storage paths", () => {
    expect(mobileJob).toContain('.from("job-photos").upload');
    expect(desktopJob).toContain('.from("job-photos").upload');
    expect(mobileJob).toContain("wo/${workOrder.id}/lines/${workOrderLineId}");
  });

  it("guards rollout with a postcheck", () => {
    expect(postcheck).toContain("trg_register_job_photo_storage_object");
    expect(postcheck).toContain("uq_work_order_media_storage_object");
    expect(postcheck).toContain(
      "Phase 6 technician mobile reliability postcheck passed.",
    );
  });
});
