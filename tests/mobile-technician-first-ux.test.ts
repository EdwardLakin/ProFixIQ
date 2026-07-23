import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
    expect(mobileHome).toContain('href: `/mobile/jobs/${line.id}`');
    expect(mobileHome).toContain('"in_progress"');
    expect(techHome).toContain('href={`/mobile/jobs/${job.id}`}');
    expect(techHome).toContain("Hours &amp; efficiency");
    expect(techHome).toContain("<details");
    expect(techHome).not.toContain("Bench-side view");
    expect(techHome).not.toContain("next action");
  });

  it("uses a factual job queue without AI or prescribed next steps", () => {
    expect(queuePage).toContain("MobileTechnicianQueue");
    expect(queue).toContain('href={`/mobile/jobs/${line.id}`}');
    expect(queue).toContain(
      "Tap a job to open its timer, photos, parts, notes, history, and assistant.",
    );
    expect(queue).toContain("Download assigned work");
    expect(queue).not.toContain("Next action:");
    expect(queue).not.toContain("Start line when bay is free");
  });

  it("keeps cause and correction available before job completion", () => {
    expect(jobPage).toContain("Cause & Correction");
    expect(jobPage).toContain("onSaveDraft={saveStory}");
    expect(jobPage).toContain("onSubmit={completeJob}");
    expect(jobPage).toContain('router.push("/mobile/tech/queue")');
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
    expect(photoModal).toContain('capture="environment"');
    expect(photoModal).toContain("void upload(selected);");
    expect(photoModal).toContain("hideFooter");
    expect(photoModal).toContain('title="Attach Photo"');
    expect(photoModal).toContain('submitText={busy ? "Uploading…" : "Upload"}');
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
