import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectTechnicianWorkOrderSnapshot } from "@/features/work-orders/mobile/technicianOfflineExecution";

const read = (path: string) => readFileSync(path, "utf8");

describe("technician offline execution", () => {
  it("projects queued notes, story, and punch state over the downloaded line", () => {
    const snapshot = {
      workOrder: { id: "wo-1" },
      lines: [
        {
          id: "line-1",
          notes: "server notes",
          cause: null,
          correction: null,
          status: "awaiting",
          punched_in_at: null,
          punched_out_at: null,
          hold_reason: null,
        },
      ],
      quoteLines: [],
      vehicle: null,
      customer: null,
      techNamesById: {},
    } as never;
    const base = {
      createdAt: "2026-07-16T10:00:00.000Z",
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    };
    const projected = projectTechnicianWorkOrderSnapshot(snapshot, [
      {
        ...base,
        clientMutationId: "notes",
        actionType: "update_work_order_line_notes",
        payload: { workOrderLineId: "line-1", notes: "device notes" },
      },
      {
        ...base,
        clientMutationId: "story",
        actionType: "save_story_draft",
        payload: {
          lineId: "line-1",
          cause: "failed seal",
          correction: "replaced seal",
        },
      },
      {
        ...base,
        clientMutationId: "finish",
        actionType: "job:punch-transition",
        payload: {
          lineId: "line-1",
          action: "finish",
          occurredAt: "2026-07-16T11:00:00.000Z",
          body: {
            cause: "failed seal",
            correction: "replaced seal",
          },
        },
      },
    ] as never);

    expect(projected.lines[0]).toMatchObject({
      notes: "device notes",
      cause: "failed seal",
      correction: "replaced seal",
      status: "completed",
      punched_out_at: "2026-07-16T11:00:00.000Z",
    });
  });

  it("projects management holds without fabricating labor timestamps", () => {
    const line = {
      id: "line-1",
      status: "awaiting_approval",
      hold_reason: null,
      punched_in_at: "2026-08-30T09:00:00.000Z",
      punched_out_at: "2026-08-30T09:30:00.000Z",
    };
    const snapshot = {
      workOrder: { id: "wo-1" },
      lines: [line],
      quoteLines: [],
      vehicle: null,
      customer: null,
      techNamesById: {},
    };
    const base = {
      createdAt: "2026-08-30T10:00:00.000Z",
      retryCount: 0,
      userId: "advisor-1",
      shopId: "shop-1",
      status: "queued",
      actionType: "job:punch-transition",
    };

    for (const transitionIntent of [
      "parts_quote_hold",
      "work_order_hold",
    ] as const) {
      const projected = projectTechnicianWorkOrderSnapshot(snapshot as never, [
        {
          ...base,
          clientMutationId: transitionIntent,
          payload: {
            lineId: "line-1",
            action: "pause",
            occurredAt: "2026-08-30T10:00:00.000Z",
            body: {
              holdReason: "Awaiting parts quote",
              transitionIntent,
            },
          },
        },
      ] as never);

      expect(projected.lines[0]).toMatchObject({
        status: "on_hold",
        hold_reason: "Awaiting parts quote",
        punched_in_at: line.punched_in_at,
        punched_out_at: line.punched_out_at,
      });
    }

    const released = projectTechnicianWorkOrderSnapshot(
      {
        ...snapshot,
        lines: [{ ...line, status: "on_hold", hold_reason: "Shop hold" }],
      } as never,
      [
        {
          ...base,
          clientMutationId: "work-order-release",
          payload: {
            lineId: "line-1",
            action: "resume",
            occurredAt: "2026-08-30T10:30:00.000Z",
            body: { transitionIntent: "work_order_release" },
          },
        },
      ] as never,
    );

    expect(released.lines[0]).toMatchObject({
      status: "awaiting",
      hold_reason: null,
      punched_in_at: line.punched_in_at,
      punched_out_at: line.punched_out_at,
    });
  });

  it("warms and caches work-order and focused-job navigation shells", () => {
    const worker = read("app/sw.ts");
    const download = read(
      "features/work-orders/mobile/technicianOfflineDownload.ts",
    );
    expect(worker).toContain('url.pathname.startsWith("/mobile/work-orders/")');
    expect(worker).toContain('url.pathname.startsWith("/mobile/jobs/")');
    expect(download).toContain("cacheTechnicianRouteShells");
    expect(download).toContain("...item.assignedLineIds.map");
    expect(download).toContain("?mode=tech&focus=${lineId}");
    expect(download).toContain("await cache.put(url, response.clone())");
  });

  it("recovers focused jobs and unsaved editor fields from scoped IndexedDB", () => {
    const execution = read(
      "features/work-orders/mobile/technicianOfflineExecution.ts",
    );
    const focused = read("features/work-orders/mobile/MobileFocusedJob.tsx");
    const modal = read(
      "features/work-orders/components/workorders/CauseCorrectionModal.tsx",
    );
    expect(execution).toContain('const DRAFT_KIND = "technician-job-draft"');
    expect(execution).toContain(
      "listOfflineSnapshots<MobileWorkOrderSnapshot>",
    );
    expect(focused).toContain("await loadOfflineJob(id)");
    expect(focused).toContain("saveTechnicianJobEditorDraft");
    expect(focused).toContain("clearTechnicianJobEditorDraftFields");
    expect(modal).toContain("onDraftChange?.(next, correction)");
    expect(modal).toContain("onDraftChange?.(cause, next)");
  });

  it("queues active-shift punches and persists their optimistic state", () => {
    const shift = read("features/mobile/shifts/offline.ts");
    const tracker = read("features/mobile/components/MobileShiftTracker.tsx");
    expect(shift).toContain('actionType: "shift:punch-event"');
    expect(shift).toContain("kind: KIND");
    expect(shift).toContain("optimisticState(args.current");
    expect(shift).toContain(
      'throw new Error("Starting a new shift requires a connection.")',
    );
    expect(tracker).toContain("getCachedMobileShiftState");
    expect(tracker).toContain("runMobileShiftAction");
    expect(tracker).toContain('performAction("end_shift")');
    const migration = read(
      "supabase/migrations/20260716220000_offline_shift_end_state.sql",
    );
    expect(migration).toContain("punch_events_finalize_shift");
    expect(migration).toContain("set status = 'completed'");
  });
});
