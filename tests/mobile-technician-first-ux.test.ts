import { readFileSync } from "node:fs";
import { describe, expect, it, test } from "vitest";
import { getMobileTilesForRole } from "@/features/mobile/config/mobile-tiles";

const mobileHome = readFileSync("app/mobile/page.tsx", "utf8");
const techHome = readFileSync(
  "features/mobile/dashboard/MobileTechHome.tsx",
  "utf8",
);
const queuePage = readFileSync("app/mobile/tech/queue/page.tsx", "utf8");
const queue = readFileSync(
  "features/mobile/technician/MobileTechnicianQueue.tsx",
  "utf8",
);
const technicianFeed = readFileSync(
  "app/api/offline/technician-work-orders/route.ts",
  "utf8",
);
const technicianOfflineDownload = readFileSync(
  "features/work-orders/mobile/technicianOfflineDownload.ts",
  "utf8",
);
const jobPage = readFileSync("app/mobile/jobs/[lineId]/page.tsx", "utf8");
const mobileShell = readFileSync("components/layout/MobileShell.tsx", "utf8");
const mobileMenu = readFileSync(
  "components/layout/MobileBottomNav.tsx",
  "utf8",
);
const photoModal = readFileSync(
  "features/work-orders/components/workorders/extras/PhotoCaptureModal.tsx",
  "utf8",
);
const mediaGallery = readFileSync(
  "features/work-orders/components/workorders/extras/WorkOrderMediaGallery.tsx",
  "utf8",
);
const focusedJobModal = readFileSync(
  "features/work-orders/components/workorders/FocusedJobModal.tsx",
  "utf8",
);
const mobileFocusedJob = readFileSync(
  "features/work-orders/mobile/MobileFocusedJob.tsx",
  "utf8",
);
const assistantModal = readFileSync(
  "features/work-orders/components/workorders/AiAssistantModal.tsx",
  "utf8",
);
const mobileAssistant = readFileSync(
  "features/mobile/technician/MobileTechnicianAssistant.tsx",
  "utf8",
);
const desktopAssistant = readFileSync(
  "features/shared/components/TechAssistant.tsx",
  "utf8",
);
const suggestions = readFileSync(
  "features/work-orders/components/SuggestedQuickAdd.tsx",
  "utf8",
);

describe("technician-first mobile UX", () => {
  it("keeps the technician home simple and opens work directly", () => {
    expect(mobileHome).toContain('`/mobile/work-orders/${line.work_order_id}`');
    expect(mobileHome).toContain('"in_progress"');
    expect(techHome).toContain('href={`/mobile/work-orders/${workOrder.id}`}');
    expect(techHome).toContain("Hours &amp; efficiency");
    expect(techHome).toContain("<details");
    expect(techHome).not.toContain("Bench-side view");
    expect(techHome).not.toContain("next action");
  });

  it("gives mechanics an assigned work-order route for contextual inspections", () => {
    const mechanicRoutes = getMobileTilesForRole("mechanic", ["all"]).map(
      (tile) => tile.href,
    );
    expect(mechanicRoutes).not.toContain("/mobile/inspections");
    expect(mechanicRoutes).toContain("/mobile/tech/queue");
    expect(mechanicRoutes).toContain("/mobile/work-orders");
  });

  it("uses a factual job queue without AI or prescribed next steps", () => {
    expect(queuePage).toContain("MobileTechnicianQueue");
    expect(queue).toContain('`/mobile/work-orders/${workOrder.id}`');
    expect(queue).toContain(
      "Tap a job to review its work order, then open the focused job or inspection.",
    );
    expect(queue).toContain("Download assigned work");
    expect(queue).toContain("fetchAssignedTechnicianWork");
    expect(queue).toContain('status === "on_hold"');
    expect(queue).not.toContain('.eq("assigned_tech_id", user.id)');
    expect(technicianOfflineDownload).toContain(
      "export async function fetchAssignedTechnicianWork",
    );
    expect(technicianFeed).toContain(
      "assigned_to.eq.${user.id},user_id.eq.${user.id}",
    );
    expect(technicianFeed).toContain(
      '.or("type.neq.historical_import,type.is.null")',
    );
    expect(queue).not.toContain("Next action:");
    expect(queue).not.toContain("Start line when bay is free");
  });

  it("keeps cause and correction available before job completion", () => {
    expect(jobPage).toContain("Cause & Correction");
    expect(jobPage).toContain("onSaveDraft={saveStory}");
    expect(jobPage).toContain("onSubmit={completeJob}");
    expect(jobPage).toContain('`/mobile/work-orders/${line.work_order_id}`');
    expect(jobPage).toContain('"/mobile/tech/queue"');
  });

  it("keeps the hold modal available before and during active work", () => {
    expect(mobileFocusedJob).toContain("<HoldModal");
    expect(mobileFocusedJob).toContain(
      "!isOnHold && !isCompleted && canStartOrResume",
    );
    expect(mobileFocusedJob).toContain("Put on Hold");
  });

  it("uses immersive headers only where the focused route owns navigation", () => {
    expect(mobileShell).toContain('pathname.startsWith("/mobile/jobs/")');
    expect(mobileShell).toContain("isImmersiveRoute(pathname)");
    expect(mobileShell).toContain("/^\\/mobile\\/inspections\\/[^/]+$/");
    expect(mobileShell).toContain("routes such as /[id]/run");
  });

  it("makes mobile photo capture direct while preserving the desktop flow", () => {
    expect(photoModal).toContain("<MobilePhotoCaptureModal");
    expect(photoModal).toContain("<DesktopPhotoCaptureModal");
    expect(photoModal).toContain("Take photo");
    expect(photoModal).toContain("Choose existing");
    expect(photoModal).toContain("Open camera");
    expect(photoModal).toContain("Choose media");
    expect(photoModal).toContain('capture="environment"');
    expect(photoModal).toContain("void upload(selected);");
    expect(photoModal).toContain("hideFooter");
    expect(photoModal).toContain('title="Attach photo / video"');
    expect(photoModal).toContain('{busy ? "Uploading..." : "Upload"}');
  });

  it("keeps the assistant contextual, question-driven, and non-automatic", () => {
    expect(mobileMenu).toContain(
      'if (role === "mechanic") return [syncItem];',
    );
    expect(mobileMenu).toContain("Open a job and tap AI Assist");
    expect(assistantModal).toContain("Ask ProFixIQ");
    expect(assistantModal).toContain("Nothing is changed automatically.");
    expect(assistantModal).toContain("<MobileTechnicianAssistant");
    expect(mobileAssistant).toContain(
      "the technician decides what is correct",
    );
    expect(mobileAssistant).not.toContain("exportToWorkOrder");
  });

  it("preserves the established desktop assistant behavior", () => {
    expect(assistantModal).toContain("<TechAssistant");
    expect(desktopAssistant).toContain(
      "Summarize &amp; Export to Work Order",
    );
    expect(desktopAssistant).toContain("exportToWorkOrder(workOrderLineId)");
  });

  it("does not auto-generate repair suggestions in the technician mobile view", () => {
    expect(suggestions).toContain("if (jobId && !mobileRoute)");
    expect(suggestions).toContain("Automatic repair suggestions are off");
    expect(suggestions).toContain("Nothing is added without your action.");
  });
});


test("job media capture supports video and attached media visibility", () => {
  expect(photoModal).toContain("Record video");
  expect(photoModal).toContain("accept=\"video/*,.mov,.m4v,.mp4,.webm\"");
  expect(photoModal).toContain("image/*,video/*,.heic,.heif,.mov,.m4v,.mp4,.webm");
  expect(photoModal).toContain("<video");
  expect(photoModal).toContain("Choose media");

  expect(mediaGallery).toContain("work_order_media");
  expect(mediaGallery).toContain("Photos & videos");
  expect(mediaGallery).toContain("Technician video");
  expect(mediaGallery).toContain("createSignedUrl");
  expect(mediaGallery).toContain("No photos or videos attached yet.");

  expect(focusedJobModal).toContain("WorkOrderMediaGallery");
  expect(mobileFocusedJob).toContain("WorkOrderMediaGallery");
  expect(mobileFocusedJob).toContain("isVideo ? \"Video\" : \"Photo\"");
});
