import { describe, expect, it } from "vitest";
import { composeWorkforceActivity } from "@/features/workforce/server/buildWorkforceActivity";

const shopId = "shop-1";
const nowIso = "2026-07-10T18:00:00.000Z";
const from = "2026-07-10T06:00:00.000Z";
const to = "2026-07-11T06:00:00.000Z";
function base(
  overrides: Partial<Parameters<typeof composeWorkforceActivity>[0]> = {},
) {
  return composeWorkforceActivity({
    shopId,
    nowIso,
    from,
    to,
    profiles: [
      {
        id: "tech-1",
        full_name: "Edward Lakin",
        email: "ed@example.com",
        role: "technician",
      },
    ],
    shifts: [],
    punches: [],
    segments: [],
    lines: [],
    workOrders: [],
    customers: [],
    vehicles: [],
    ...overrides,
  } as any);
}
const shift = {
  id: "shift-1",
  shop_id: shopId,
  user_id: "tech-1",
  start_time: "2026-07-10T17:00:00.000Z",
  end_time: null,
  status: "active",
  type: "shift",
  created_at: null,
};
const line = {
  id: "line-1",
  shop_id: shopId,
  work_order_id: "wo-1",
  description: "Oil and filter change",
  job_type: "maintenance",
  assigned_tech_id: "tech-1",
  labor_time: 1,
  status: "active",
  line_status: "active",
  updated_at: null,
  punched_out_at: null,
};
const wo = {
  id: "wo-1",
  shop_id: shopId,
  custom_id: "EL000001",
  external_id: null,
  status: "open",
  customer_id: "cust-1",
  customer_name: null,
  vehicle_id: "veh-1",
  vehicle_year: null,
  vehicle_make: null,
  vehicle_model: null,
  vehicle_unit_number: null,
  vehicle_license_plate: null,
};
const segment = {
  id: "seg-1",
  shop_id: shopId,
  technician_id: "tech-1",
  work_order_id: "wo-1",
  work_order_line_id: "line-1",
  started_at: "2026-07-10T17:30:00.000Z",
  ended_at: null,
  pause_reason: null,
  source: "job_punch",
  created_at: "2026-07-10T17:30:00.000Z",
  updated_at: "2026-07-10T17:30:00.000Z",
  created_by: null,
};

describe("workforce activity DTO", () => {
  it("maps active shift plus active segment to working_on_job with enrichment", () => {
    const r = base({
      shifts: [shift],
      segments: [segment],
      lines: [line],
      workOrders: [wo],
      customers: [
        {
          id: "cust-1",
          shop_id: shopId,
          name: "Gabriel Anderson",
          business_name: null,
          first_name: null,
          last_name: null,
        },
      ],
      vehicles: [
        {
          id: "veh-1",
          shop_id: shopId,
          year: 2022,
          make: "GMC",
          model: "Savana",
          unit_number: null,
          license_plate: null,
        },
      ],
    });
    const a = r.activities[0];
    expect(a.operationalState).toBe("working_on_job");
    expect(a.currentJob?.workOrderNumber).toBe("EL000001");
    expect(a.currentJob?.elapsedMinutes).toBe(30);
    expect(a.currentJob?.customerName).toBe("Gabriel Anderson");
    expect(a.currentJob?.vehicleLabel).toContain("2022 GMC Savana");
  });
  it("maps active shift with no segment to idle and clamps idle non-negative", () => {
    const a = base({ shifts: [shift] }).activities[0];
    expect(a.operationalState).toBe("clocked_in_idle");
    expect(a.today.idleMinutes).toBeGreaterThanOrEqual(0);
  });
  it("break/lunch state overrides working display", () => {
    const a = base({
      shifts: [shift],
      punches: [
        {
          id: "p1",
          shift_id: "shift-1",
          user_id: "tech-1",
          profile_id: null,
          event_type: "break_start",
          timestamp: "2026-07-10T17:50:00.000Z",
          note: null,
          created_at: null,
        },
      ],
      segments: [segment],
      lines: [line],
      workOrders: [wo],
    }).activities[0];
    expect(a.operationalState).toBe("on_break");
  });
  it("flags active segment with no shift", () => {
    const a = base({ segments: [segment], lines: [line], workOrders: [wo] })
      .activities[0];
    expect(a.exceptions.map((e) => e.code)).toContain("active_job_off_shift");
  });
  it("selects multiple active segments deterministically and emits exception", () => {
    const seg2 = {
      ...segment,
      id: "seg-2",
      started_at: "2026-07-10T17:40:00.000Z",
    };
    const a = base({
      shifts: [shift],
      segments: [seg2, segment],
      lines: [line],
      workOrders: [wo],
    }).activities[0];
    expect(a.currentJob?.laborSegmentId).toBe("seg-1");
    expect(a.exceptions.map((e) => e.code)).toContain("multiple_active_jobs");
  });
  it("flags ended shift with open segment", () => {
    const a = base({
      shifts: [{ ...shift, end_time: "2026-07-10T17:55:00.000Z" }],
      segments: [segment],
      lines: [line],
      workOrders: [wo],
    }).activities[0];
    expect(a.exceptions.map((e) => e.code)).toContain(
      "shift_ended_with_active_job",
    );
  });
  it("calculates break duration", () => {
    const a = base({
      shifts: [shift],
      punches: [
        {
          id: "p1",
          shift_id: "shift-1",
          user_id: "tech-1",
          profile_id: null,
          event_type: "lunch_start",
          timestamp: "2026-07-10T17:00:00.000Z",
          note: null,
          created_at: null,
        },
        {
          id: "p2",
          shift_id: "shift-1",
          user_id: "tech-1",
          profile_id: null,
          event_type: "lunch_end",
          timestamp: "2026-07-10T17:30:00.000Z",
          note: null,
          created_at: null,
        },
      ],
    }).activities[0];
    expect(a.today.lunchMinutes).toBe(30);
  });
  it("keeps sold labor separate from actual job time", () => {
    const a = base({
      shifts: [shift],
      segments: [{ ...segment, ended_at: "2026-07-10T17:45:00.000Z" }],
      lines: [{ ...line, labor_time: 2 }],
      workOrders: [wo],
    }).activities[0];
    expect(a.today.jobMinutes).toBe(15);
    expect(a.today.soldLaborHours).toBe(2);
  });

  it("counts one line with one segment as one sold labor estimate", () => {
    const a = base({
      shifts: [shift],
      segments: [{ ...segment, ended_at: "2026-07-10T17:45:00.000Z" }],
      lines: [line],
      workOrders: [wo],
    }).activities[0];
    expect(a.today.soldLaborHours).toBe(1);
  });

  it("deduplicates sold labor for the same line with two segments while summing actual minutes", () => {
    const resumed = {
      ...segment,
      id: "seg-2",
      started_at: "2026-07-10T17:50:00.000Z",
      ended_at: null,
    };
    const a = base({
      shifts: [shift],
      segments: [{ ...segment, ended_at: "2026-07-10T17:45:00.000Z" }, resumed],
      lines: [line],
      workOrders: [wo],
    }).activities[0];

    expect(a.today.jobMinutes).toBe(25);
    expect(a.today.soldLaborHours).toBe(1);
    expect(a.currentJob?.lineId).toBe("line-1");
    expect(a.currentJob?.workOrderNumber).toBe("EL000001");
  });

  it("keeps sold labor stable through repeated pause and resume segments", () => {
    const a = base({
      shifts: [shift],
      segments: [
        {
          ...segment,
          id: "seg-1",
          started_at: "2026-07-10T17:00:00.000Z",
          ended_at: "2026-07-10T17:10:00.000Z",
        },
        {
          ...segment,
          id: "seg-2",
          started_at: "2026-07-10T17:20:00.000Z",
          ended_at: "2026-07-10T17:30:00.000Z",
        },
        {
          ...segment,
          id: "seg-3",
          started_at: "2026-07-10T17:40:00.000Z",
          ended_at: null,
        },
      ],
      lines: [line],
      workOrders: [wo],
    }).activities[0];

    expect(a.today.jobMinutes).toBe(40);
    expect(a.today.soldLaborHours).toBe(1);
  });

  it("sums sold labor for two unique active lines", () => {
    const line2 = {
      ...line,
      id: "line-2",
      labor_time: 2,
      description: "Brake service",
    };
    const wo2 = { ...wo, id: "wo-2", custom_id: "EL000002" };
    const a = base({
      shifts: [shift],
      segments: [
        { ...segment, ended_at: "2026-07-10T17:45:00.000Z" },
        {
          ...segment,
          id: "seg-2",
          work_order_id: "wo-2",
          work_order_line_id: "line-2",
          started_at: "2026-07-10T17:45:00.000Z",
          ended_at: null,
        },
      ],
      lines: [line, line2],
      workOrders: [wo, wo2],
    }).activities[0];

    expect(a.today.soldLaborHours).toBe(3);
  });

  it("deduplicates sold labor when duplicate segment rows point to the same line", () => {
    const a = base({
      shifts: [shift],
      segments: [segment, { ...segment, id: "seg-duplicate" }],
      lines: [line],
      workOrders: [wo],
    }).activities[0];
    expect(a.today.soldLaborHours).toBe(1);
  });

  it("excludes cross-shop lines and segments from sold labor", () => {
    const a = base({
      shifts: [shift],
      segments: [{ ...segment, shop_id: "other-shop" }],
      lines: [line],
      workOrders: [wo],
    }).activities[0];

    expect(a.today.soldLaborHours).toBe(0);
  });

  it("treats null, negative, and informational labor lines as zero sold labor", () => {
    const nullLine = { ...line, id: "line-null", labor_time: null };
    const negativeLine = { ...line, id: "line-negative", labor_time: -2 };
    const infoLine = {
      ...line,
      id: "line-info",
      labor_time: 5,
      line_type: "informational",
    };
    const a = base({
      shifts: [shift],
      segments: [
        { ...segment, id: "seg-null", work_order_line_id: "line-null" },
        { ...segment, id: "seg-negative", work_order_line_id: "line-negative" },
        { ...segment, id: "seg-info", work_order_line_id: "line-info" },
      ],
      lines: [nullLine, negativeLine, infoLine],
      workOrders: [wo],
    }).activities[0];

    expect(a.today.soldLaborHours).toBe(0);
  });

  it("deduplicates shop summary sold hours by unique line across segments and technicians", () => {
    const r = base({
      profiles: [
        {
          id: "tech-1",
          full_name: "Edward Lakin",
          email: "ed@example.com",
          role: "technician",
        },
        {
          id: "tech-2",
          full_name: "Mina Perez",
          email: "mina@example.com",
          role: "technician",
        },
      ],
      shifts: [shift, { ...shift, id: "shift-2", user_id: "tech-2" }],
      segments: [
        {
          ...segment,
          id: "seg-1",
          technician_id: "tech-1",
          ended_at: "2026-07-10T17:40:00.000Z",
        },
        {
          ...segment,
          id: "seg-2",
          technician_id: "tech-2",
          started_at: "2026-07-10T17:45:00.000Z",
        },
      ],
      lines: [line],
      workOrders: [wo],
    });

    expect(r.summary.soldLaborHoursToday).toBe(1);
  });

  it("enforces same-shop lines and work orders", () => {
    const r = base({
      segments: [segment],
      lines: [{ ...line, shop_id: "other" }],
      workOrders: [wo],
    });
    expect(r.activities[0].currentJob).toBeNull();
  });

  it("reports no current job after hold release closes the active labor segment", () => {
    const releasedLine = {
      ...line,
      status: "awaiting",
      line_status: "awaiting",
      punched_out_at: "2026-07-10T17:45:00.000Z",
    };
    const closedSegment = { ...segment, ended_at: "2026-07-10T17:45:00.000Z" };
    const a = base({
      shifts: [shift],
      segments: [closedSegment],
      lines: [releasedLine],
      workOrders: [wo],
    }).activities[0];
    expect(a.operationalState).toBe("clocked_in_idle");
    expect(a.currentJob).toBeNull();
  });
  it("orders combined feed newest first", () => {
    const r = base({
      shifts: [shift],
      punches: [
        {
          id: "p1",
          shift_id: "shift-1",
          user_id: "tech-1",
          profile_id: null,
          event_type: "start_shift",
          timestamp: "2026-07-10T17:00:00.000Z",
          note: null,
          created_at: null,
        },
      ],
      segments: [segment],
      lines: [line],
      workOrders: [wo],
    });
    expect(r.feed[0].action).toBe("started job");
  });
});
