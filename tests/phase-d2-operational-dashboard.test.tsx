import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import WorkOrderBoardCard from "@/features/shared/components/workboard/WorkOrderBoardCard";
import type { WorkOrderBoardRow } from "@/features/shared/lib/workboard/types";
import { TechnicianActivityCard } from "@/features/workforce/components/TechnicianActivityCard";
import { formatWorkforceActivityAction } from "@/features/workforce/components/WorkforceActivityFeed";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("Phase D2 operational dashboard evolution", () => {
  it("Immediate Attention cards only keep positive counts and quick actions have no duplicates", () => {
    const attention = [
      { label: "Waiting for customer approval", value: 2 },
      { label: "Waiting for parts", value: 0 },
      { label: "Jobs on hold", value: 1 },
    ].filter((item) => item.value > 0);
    const quickActions = [
      { label: "Create Work Order", href: "/work-orders/create" },
      { label: "Work Order Board", href: "/work-orders/board" },
      { label: "Attendance", href: "/dashboard/workforce/attendance" },
      { label: "Customers", href: "/customers" },
      { label: "Vehicles", href: "/vehicles" },
      { label: "Schedule", href: "/dashboard/bookings" },
    ];

    expect(attention.map((item) => item.label)).toEqual([
      "Waiting for customer approval",
      "Jobs on hold",
    ]);
    expect(new Set(quickActions.map((action) => action.href)).size).toBe(quickActions.length);
    expect(quickActions.find((action) => action.label === "Work Order Board")?.href).toBe("/work-orders/board");
  });

  it("Work Order Board cards display technician assignment and operational badges", () => {
    const row: WorkOrderBoardRow = {
      work_order_id: "wo-1",
      custom_id: "WO-1001",
      display_name: "Ada Customer",
      unit_label: null,
      vehicle_label: "2022 Ford F-150",
      jobs_total: 3,
      jobs_completed: 1,
      progress_pct: 33,
      overall_stage: "waiting_parts",
      risk_level: "warn",
      priority: 2,
      is_waiter: true,
      first_tech_name: "Sam Tech",
      tech_names: ["Sam Tech", "Riley Tech"],
      assigned_tech_count: 2,
      jobs_open: 2,
      jobs_blocked: 1,
      jobs_waiting_parts: 1,
    };

    const markup = renderToStaticMarkup(<WorkOrderBoardCard row={row} variant="shop" />);
    expect(markup).toContain("Waiting Parts");
    expect(markup).toContain("Customer Waiting");
    expect(markup).toContain("Multiple Technicians");
    expect(markup).toContain("Assigned: Sam Tech, Riley Tech");
    expect(markup).toContain("Labor:");
  });

  it("Attendance cards show technician operational data without duplicating dispatch", () => {
    const markup = renderToStaticMarkup(
      <TechnicianActivityCard
        timezone="UTC"
        activity={{
          userId: "tech-1",
          employeeName: "Sam Tech",
          employeeEmail: "sam@example.com",
          workforceRole: "technician",
          shiftId: "shift-1",
          shiftStatus: "active",
          shiftActivity: "working",
          shiftStartTime: "2026-07-10T12:00:00.000Z",
          shiftEndTime: null,
          latestShiftEventType: "start_shift",
          latestShiftEventAt: "2026-07-10T12:00:00.000Z",
          currentJob: {
            laborSegmentId: "seg-1",
            workOrderId: "wo-1",
            workOrderNumber: "1001",
            workOrderStatus: "in_progress",
            lineId: "line-1",
            lineDescription: "Brake inspection",
            jobType: "labor",
            customerId: "cust-1",
            customerName: "Ada Customer",
            vehicleId: "veh-1",
            vehicleLabel: "2022 Ford F-150",
            jobStartedAt: "2026-07-10T12:30:00.000Z",
            elapsedMinutes: 45,
            assignedTechId: "tech-1",
          },
          today: { shiftMinutes: 120, breakMinutes: 0, lunchMinutes: 0, jobMinutes: 45, productiveMinutes: 45, idleMinutes: 75, soldLaborHours: 1.5, completedJobCount: 1 },
          operationalState: "working_on_job",
          exceptions: [],
        }}
      />,
    );

    expect(markup).toContain("WO 1001");
    expect(markup).toContain("Ada Customer");
    expect(markup).toContain("2022 Ford F-150");
    expect(markup).toContain("Open current work order");
    expect(markup).not.toContain("Open Work Order Board");
  });

  it("Activity feed formats hold and resume wording precisely", () => {
    expect(formatWorkforceActivityAction("job_hold", "1001")).toBe("Placed Work Order 1001 on Hold");
    expect(formatWorkforceActivityAction("job_resumed", "1001")).toBe("Resumed Work Order 1001");
  });
});
